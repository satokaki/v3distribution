const locks = new Map<string, Promise<unknown>>();

export class PostingError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}

const ymd = (value?: string) => (value || new Date().toISOString()).slice(0, 10);
const entityOne = async (entity: any, query: any) => (await entity.filter(query, "created_date", 10))[0] || null;
const lock = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
  const previous = locks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  locks.set(key, current);
  try { return await current as T; } finally { if (locks.get(key) === current) locks.delete(key); }
};

async function nextCode(entity: any, prefix: string, date: string) {
  const day = ymd(date).replace(/-/g, "");
  const rows = await entity.list("-created_date", 500);
  const count = rows.filter((row: any) => String(row.code || "").startsWith(`${prefix}-${day}-`)).length;
  return `${prefix}-${day}-${String(count + 1).padStart(4, "0")}`;
}

export async function resolvePostingBranch(user: any, db: any, requestedBranchId = "") {
  if (!user) throw new PostingError("UNAUTHENTICATED", "Authentication required", 401);

  const mappings = await db.UserBranch.filter(
    { user_id: user.id, status: "active" },
    "-is_default",
    100
  );

  const requested = String(requestedBranchId || "").trim();

  let branchId = "";
  if (requested) {
    const allowed = mappings.some((row: any) => row.branch_id === requested);
    if (!allowed) {
      throw new PostingError(
        "BRANCH_ACCESS_DENIED",
        "User tidak memiliki akses ke cabang transaksi yang dipilih",
        403
      );
    }
    branchId = requested;
  } else {
    branchId =
      mappings.find((row: any) => row.branch_id === user.default_branch_id)?.branch_id ||
      mappings.find((row: any) => row.is_default)?.branch_id ||
      mappings[0]?.branch_id ||
      "";
  }

  if (!branchId) {
    throw new PostingError(
      "BRANCH_NOT_ASSIGNED",
      "User belum memiliki mapping cabang",
      403
    );
  }

  const branch = await entityOne(db.Branch, { id: branchId });
  if (!branch || branch.is_active === false) {
    throw new PostingError(
      "BRANCH_NOT_ASSIGNED",
      "Cabang user tidak aktif atau tidak ditemukan",
      403
    );
  }

  return branch;
}

async function resolvedStock(db: any, branchId: string, productId: string) {
  const rows = await db.StockBalance.filter({ branch_id: branchId, product_id: productId }, "created_date", 500);
  const branchRows = rows.filter((row: any) => row.balance_scope === "branch");
  if (branchRows.length > 1) throw new PostingError("BRANCH_BALANCE_CONFLICT", `Saldo branch ganda untuk produk ${productId}`, 409);
  if (branchRows[0]) return { balance: branchRows[0], quantity: Number(branchRows[0].quantity || 0) };
  const legacy = rows.filter((row: any) => row.balance_scope !== "branch" && row.warehouse_id);
  return { balance: null, quantity: legacy.reduce((sum: number, row: any) => sum + Number(row.quantity || 0), 0) };
}

async function ensureBranchBalance(db: any, branch: any, product: any) {
  return lock(`balance:${branch.id}:${product.id}`, async () => {
    let resolved = await resolvedStock(db, branch.id, product.id);
    if (resolved.balance) return resolved.balance;
    resolved = await resolvedStock(db, branch.id, product.id);
    if (resolved.balance) return resolved.balance;
    const created = await db.StockBalance.create({ product_id: product.id, product_name: product.name, sku: product.sku, branch_id: branch.id, branch_code: branch.code, balance_scope: "branch", warehouse_id: null, warehouse_name: "", quantity: resolved.quantity, unit: product.base_unit || "pcs", min_stock: product.min_stock || 0 });
    const checked = await resolvedStock(db, branch.id, product.id);
    if (checked.balance?.id === created.id) return created;
    if (checked.balance) { await db.StockBalance.delete(created.id); return checked.balance; }
    throw new PostingError("BRANCH_BALANCE_CONFLICT", `Gagal menetapkan saldo branch produk ${product.id}`, 409);
  });
}

async function moveStock(db: any, { branch, product, direction, qty, refType, refId, refCode, note }: any) {
  return lock(`movement:${branch.id}:${product.id}`, async () => {
    const balance = await ensureBranchBalance(db, branch, product);
    const current = Number(balance.quantity || 0);
    const next = direction === "in" ? current + qty : current - qty;
    if (next < 0) throw new PostingError("INSUFFICIENT_STOCK", `Stok ${product.name || product.sku} tidak cukup (tersedia ${current}, butuh ${qty})`, 409);
    await db.StockBalance.update(balance.id, { quantity: next, balance_scope: "branch", warehouse_id: null, warehouse_name: "" });
    const ledger = await db.StockLedger.create({ product_id: product.id, product_name: product.name, sku: product.sku, branch_id: branch.id, branch_code: branch.code, balance_scope: "branch", warehouse_id: null, warehouse_name: "", movement_type: direction, ref_type: refType, ref_id: refId, ref_code: refCode, quantity: qty, balance_after: next, note, date: new Date().toISOString() });
    return { balanceId: balance.id, ledgerId: ledger.id, previous: current, next };
  });
}

async function validateItems(db: any, items: any[], kind: "sale" | "purchase") {
  if (!Array.isArray(items) || !items.length) throw new PostingError("ITEMS_REQUIRED", "Minimal satu item diperlukan");
  const validated = [];
  for (const item of items) {
    const qty = Number(item.qty || 0); const price = Number(item.price);
    if (qty <= 0) throw new PostingError("INVALID_QTY", "Qty harus lebih dari 0");
    if (!Number.isFinite(price) || price < 0) throw new PostingError(kind === "sale" ? "INVALID_PRICE_SNAPSHOT" : "INVALID_PURCHASE_PRICE", "Snapshot harga tidak valid");
    const product = await entityOne(db.Product, { id: item.product_id });
    if (!product || product.is_active === false) throw new PostingError("INVALID_PRODUCT", `Produk ${item.product_id || "-"} tidak valid`);
    validated.push({ ...item, qty, price, product });
  }
  return validated;
}

async function cashMovement(db: any, { branch, payload, created, code, direction, category }: any) {
  if (!payload.account_id) throw new PostingError("INVALID_PAYMENT", "Rekening pembayaran wajib dipilih");
  const account = await entityOne(db.Account, { id: payload.account_id });
  if (!account || account.branch_id !== branch.id) throw new PostingError("INVALID_PAYMENT", "Rekening tidak valid untuk cabang user");
  const previous = Number(account.current_balance || 0); const amount = Number(payload.total || 0);
  const next = previous + (direction === "in" ? amount : -amount);
  const tx = await db.CashTransaction.create({ code: await nextCode(db.CashTransaction, "KAS", payload.date), date: payload.date, account_id: account.id, account_name: account.name, branch_id: branch.id, branch_code: branch.code, type: direction, category, amount, balance_after: next, ref_type: created.__kind, ref_id: created.id, ref_code: code, description: `${category} ${code}` });
  await db.Account.update(account.id, { current_balance: next });
  return { txId: tx.id, accountId: account.id, previous };
}

async function audit(db: any, user: any, branch: any, kind: string, created: any, requestId: string) {
  await db.AuditLog.create({ user_id: user.id, user_name: user.display_name || user.full_name || user.email || "", branch_id: branch.id, action: `post_${kind}`, module: kind === "sale" ? "penjualan" : "pembelian", entity: kind === "sale" ? "Sale" : "Purchase", entity_id: created.id, request_id: requestId, description: `Backend posting ${created.code}` });
}

export async function postTransaction({ kind, payload, user, db }: { kind: "sale" | "purchase"; payload: any; user: any; db: any }) {
  const requestId = String(payload.posting_request_id || "").trim();
  if (!requestId) throw new PostingError("REQUEST_ID_REQUIRED", "Posting request ID wajib tersedia");
  const entity = kind === "sale" ? db.Sale : db.Purchase;
  return lock(`posting:${kind}:${requestId}`, async () => {
    const duplicate = await entityOne(entity, { posting_request_id: requestId, status: "posted" });
    if (duplicate) return { transaction: duplicate, idempotent: true };
    if (payload.status === "posted") throw new PostingError("ALREADY_POSTED", "Transaksi posted tidak dapat diposting ulang", 409);
    const branch = await resolvePostingBranch(user, db, payload.branch_id);

    if (kind === "purchase" && branch.branch_type !== "pusat") {
      throw new PostingError(
        "PURCHASE_HEAD_OFFICE_ONLY",
        "Pembelian supplier hanya dapat dilakukan dari Pusat / Head Office",
        403
      );
    }

    const items = await validateItems(db, payload.items, kind);
    const payment = payload.payment_method || "tunai";
    if (!['tunai', 'kredit'].includes(payment)) throw new PostingError("INVALID_PAYMENT", "Metode pembayaran tidak valid");
    if (kind === "sale" && payment === "kredit" && !payload.customer_id) throw new PostingError("INVALID_CUSTOMER", "Customer wajib untuk penjualan tempo");
    if (kind === "purchase" && !payload.supplier_id) throw new PostingError("INVALID_SUPPLIER", "Supplier wajib dipilih");
    if (kind === "purchase" && payment === "kredit" && !payload.due_date) throw new PostingError("INVALID_PAYMENT", "Jatuh tempo wajib untuk pembelian kredit");
    if (kind === "sale") for (const item of items) { const stock = await resolvedStock(db, branch.id, item.product.id); if (stock.quantity < item.qty) throw new PostingError("INSUFFICIENT_STOCK", `Stok ${item.product.name} tidak cukup`, 409); }

    const code = await nextCode(entity, kind === "sale" ? "PEN" : "PMB", payload.date);
    const cleanItems = items.map(({ product, ...item }: any) => item);
    const { id: _id, code: _code, status: _status, created_date: _createdDate, updated_date: _updatedDate, created_by: _createdBy, created_by_id: _createdById, ...businessPayload } = payload;
    const created = await entity.create({ ...businessPayload, branch_id: branch.id, branch_code: branch.code, posting_request_id: requestId, items: cleanItems, code, status: "posted" });
    const idempotencyCheck = await entity.filter({ posting_request_id: requestId, status: "posted" }, "created_date", 10);
    if (idempotencyCheck.length > 1 && idempotencyCheck[0].id !== created.id) { await entity.delete(created.id); return { transaction: idempotencyCheck[0], idempotent: true }; }
    if (idempotencyCheck.length > 1) { await entity.delete(created.id); throw new PostingError("DUPLICATE_REQUEST", "Request posting bersamaan terdeteksi dan dihentikan", 409); }
    created.__kind = kind;
    const moved: any[] = []; let cash: any = null; let debt: any = null; let commissionId = ""; const priceChanges: any[] = [];
    try {
      for (const item of items) moved.push(await moveStock(db, { branch, product: item.product, direction: kind === "sale" ? "out" : "in", qty: item.qty, refType: kind, refId: created.id, refCode: code, note: `${kind === "sale" ? "Penjualan" : "Pembelian"} ${code}` }));
      if (payment === "tunai") cash = await cashMovement(db, { branch, payload, created, code, direction: kind === "sale" ? "in" : "out", category: kind === "sale" ? "Penjualan" : "Pembelian" });
      else if (kind === "sale") {
        const customer = await entityOne(db.Customer, { id: payload.customer_id }); if (!customer || customer.is_active === false) throw new PostingError("INVALID_CUSTOMER", "Customer tidak valid");
        const row = await db.Receivable.create({ code: await nextCode(db.Receivable, "PTG", payload.date), date: payload.date, due_date: payload.due_date || "", customer_id: customer.id, customer_name: customer.name, branch_id: branch.id, branch_code: branch.code, source: "sale", ref_type: "sale", ref_id: created.id, ref_code: code, amount: payload.total || 0, paid_amount: 0, status: "unpaid" });
        debt = { kind: "receivable", id: row.id, partyId: customer.id, previous: Number(customer.receivable_balance || 0) }; await db.Customer.update(customer.id, { receivable_balance: debt.previous + Number(payload.total || 0) });
      } else {
        const supplier = await entityOne(db.Supplier, { id: payload.supplier_id }); if (!supplier || supplier.is_active === false) throw new PostingError("INVALID_SUPPLIER", "Supplier tidak valid");
        const row = await db.Payable.create({ code: await nextCode(db.Payable, "HTG", payload.date), date: payload.date, due_date: payload.due_date, supplier_id: supplier.id, supplier_name: supplier.name, branch_id: branch.id, branch_code: branch.code, source: "purchase", ref_type: "purchase", ref_id: created.id, ref_code: code, amount: payload.total || 0, paid_amount: 0, status: "unpaid" });
        debt = { kind: "payable", id: row.id, partyId: supplier.id, previous: Number(supplier.debt_balance || 0) }; await db.Supplier.update(supplier.id, { debt_balance: debt.previous + Number(payload.total || 0) });
      }
      if (kind === "purchase") for (const item of items) { priceChanges.push({ id: item.product.id, previous: item.product.purchase_price }); await db.Product.update(item.product.id, { purchase_price: item.price }); }
      if (kind === "sale" && payload.salesperson_id) {
        const salesperson = await entityOne(db.Salesperson, { id: payload.salesperson_id }); const rate = Number(salesperson?.commission_rate || 0);
        if (rate > 0) { const row = await db.Commission.create({ code: await nextCode(db.Commission, "KMS", payload.date), date: payload.date, salesperson_id: salesperson.id, salesperson_name: salesperson.name, branch_id: branch.id, branch_code: branch.code, sale_id: created.id, sale_code: code, sale_total: payload.total || 0, rate, amount: Math.round(Number(payload.total || 0) * rate / 100), status: "accrued" }); commissionId = row.id; }
      }
      await audit(db, user, branch, kind, created, requestId);
      delete created.__kind; return { transaction: created, idempotent: false };
    } catch (error) {
      for (let index = moved.length - 1; index >= 0; index--) { const movement = moved[index]; await db.StockBalance.update(movement.balanceId, { quantity: movement.previous }); try { await db.StockLedger.delete(movement.ledgerId); } catch {} }
      if (cash) { try { await db.CashTransaction.delete(cash.txId); await db.Account.update(cash.accountId, { current_balance: cash.previous }); } catch {} }
      if (debt?.kind === "receivable") { try { await db.Receivable.delete(debt.id); await db.Customer.update(debt.partyId, { receivable_balance: debt.previous }); } catch {} }
      if (debt?.kind === "payable") { try { await db.Payable.delete(debt.id); await db.Supplier.update(debt.partyId, { debt_balance: debt.previous }); } catch {} }
      if (commissionId) try { await db.Commission.delete(commissionId); } catch {}
      for (const change of priceChanges) try { await db.Product.update(change.id, { purchase_price: change.previous }); } catch {}
      try { await entity.delete(created.id); } catch {}
      throw error;
    }
  });
}

export function safePostingError(error: any) {
  if (error instanceof PostingError) return { status: error.status, body: { error: error.code, message: error.message } };
  return { status: 500, body: { error: "POSTING_FAILED", message: "Posting gagal diproses" } };
}