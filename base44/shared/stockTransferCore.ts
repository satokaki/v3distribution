const locks = new Map<string, Promise<unknown>>();

export class TransferError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}

const lock = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
  const previous = locks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  locks.set(key, current);
  try { return await current as T; } finally { if (locks.get(key) === current) locks.delete(key); }
};
const one = async (entity: any, query: any) => (await entity.filter(query, "created_date", 10))[0] || null;
const sourceId = (transfer: any) => transfer.source_branch_id || transfer.from_branch_id || "";
const destinationId = (transfer: any) => transfer.destination_branch_id || transfer.to_branch_id || "";
const transferNumber = (transfer: any) => transfer.transfer_number || transfer.code || "";
const userName = (user: any) => user.display_name || user.full_name || user.email || user.id;

async function activeMappings(user: any, db: any) {
  if (!user) throw new TransferError("UNAUTHENTICATED", "Authentication required", 401);
  return await db.UserBranch.filter({ user_id: user.id, status: "active" }, "-is_default", 100);
}

export async function resolveSourceBranch(user: any, db: any) {
  const mappings = await activeMappings(user, db);
  const branchId = mappings.find((row: any) => row.branch_id === user.default_branch_id)?.branch_id || mappings.find((row: any) => row.is_default)?.branch_id || mappings[0]?.branch_id;
  if (!branchId) throw new TransferError("BRANCH_NOT_ASSIGNED", "User belum memiliki mapping cabang aktif", 403);
  const branch = await one(db.Branch, { id: branchId });
  if (!branch || branch.is_active === false) throw new TransferError("BRANCH_NOT_ASSIGNED", "Cabang asal tidak aktif atau tidak ditemukan", 403);
  return branch;
}

async function resolveDestination(id: string, source: any, db: any) {
  const branch = id ? await one(db.Branch, { id }) : null;
  if (!branch || branch.is_active === false) throw new TransferError("INVALID_DESTINATION_BRANCH", "Cabang tujuan tidak valid atau tidak aktif");
  if (branch.id === source.id) throw new TransferError("SAME_BRANCH_TRANSFER", "Cabang tujuan harus berbeda dari cabang asal");
  return branch;
}

async function assertSourcePermission(user: any, db: any, branchId: string, flags: string[]) {
  if (user?.role === "admin" || user?.app_role === "super_admin") return;
  const mappings = await activeMappings(user, db); const mapping = mappings.find((row: any) => row.branch_id === branchId);
  if (!mapping || !flags.some((flag) => mapping[flag] === true)) throw new TransferError("INVALID_TRANSFER", "User tidak memiliki permission untuk aksi mutasi ini", 403);
}

async function validateItems(items: any[], db: any) {
  if (!Array.isArray(items) || !items.length) throw new TransferError("INVALID_TRANSFER", "Minimal satu item diperlukan");
  const seen = new Set<string>(); const valid = [];
  for (const row of items) {
    const qty = Number(row.requested_qty ?? row.qty ?? 0);
    if (!row.product_id || !Number.isFinite(qty) || qty <= 0 || seen.has(row.product_id)) throw new TransferError("INVALID_TRANSFER", "Produk dan qty mutasi tidak valid atau duplikat");
    const product = await one(db.Product, { id: row.product_id });
    if (!product || product.is_active === false) throw new TransferError("INVALID_TRANSFER", `Produk ${row.product_id} tidak valid`);
    seen.add(row.product_id);
    valid.push({ product, product_id: product.id, sku: product.sku || row.sku || "", product_name: product.name || row.product_name || "", unit: product.unit || row.unit || "pcs", qty, requested_qty: qty });
  }
  return valid;
}

async function resolvedStock(db: any, branchId: string, productId: string) {
  const rows = await db.StockBalance.filter({ branch_id: branchId, product_id: productId }, "created_date", 500);
  const branchRows = rows.filter((row: any) => row.balance_scope === "branch");
  if (branchRows.length > 1) throw new TransferError("BRANCH_BALANCE_CONFLICT", `Saldo branch ganda untuk produk ${productId}`, 409);
  if (branchRows[0]) return { balance: branchRows[0], quantity: Number(branchRows[0].quantity || 0) };
  return { balance: null, quantity: rows.filter((row: any) => row.balance_scope !== "branch" && row.warehouse_id).reduce((sum: number, row: any) => sum + Number(row.quantity || 0), 0) };
}

async function ensureBalance(db: any, branch: any, product: any) {
  return lock(`transfer-balance:${branch.id}:${product.id}`, async () => {
    let stock = await resolvedStock(db, branch.id, product.id);
    if (stock.balance) return { balance: stock.balance, created: false };
    stock = await resolvedStock(db, branch.id, product.id);
    if (stock.balance) return { balance: stock.balance, created: false };
    const created = await db.StockBalance.create({ product_id: product.id, product_name: product.name, sku: product.sku, branch_id: branch.id, branch_code: branch.code, balance_scope: "branch", warehouse_id: null, warehouse_name: "", quantity: stock.quantity, unit: product.unit || "pcs", min_stock: product.min_stock || 0 });
    const checked = await resolvedStock(db, branch.id, product.id);
    if (checked.balance?.id === created.id) return { balance: created, created: true };
    if (checked.balance) { await db.StockBalance.delete(created.id); return { balance: checked.balance, created: false }; }
    throw new TransferError("BRANCH_BALANCE_CONFLICT", `Gagal menetapkan saldo branch produk ${product.id}`, 409);
  });
}

async function move(db: any, { branch, product, qty, direction, transfer, note }: any) {
  return lock(`transfer-movement:${branch.id}:${product.id}`, async () => {
    const ensured = await ensureBalance(db, branch, product);
    const current = Number(ensured.balance.quantity || 0);
    const next = current + qty;
    if (next < 0) throw new TransferError("INSUFFICIENT_STOCK", `Stok ${product.name} tidak cukup`, 409);
    await db.StockBalance.update(ensured.balance.id, { quantity: next, balance_scope: "branch", warehouse_id: null, warehouse_name: "" });
    const ledger = await db.StockLedger.create({ product_id: product.id, product_name: product.name, sku: product.sku, branch_id: branch.id, branch_code: branch.code, balance_scope: "branch", warehouse_id: null, warehouse_name: "", movement_type: direction, transaction_type: direction, ref_type: "stock_transfer", ref_id: transfer.id, transaction_id: transfer.id, ref_code: transferNumber(transfer), reference_number: transferNumber(transfer), quantity: qty, balance_after: next, note, date: new Date().toISOString(), transaction_date: new Date().toISOString() });
    return { balanceId: ensured.balance.id, ledgerId: ledger.id, previous: current, createdBalance: ensured.created };
  });
}

async function rollbackMovements(db: any, movements: any[]) {
  for (let index = movements.length - 1; index >= 0; index -= 1) {
    const movement = movements[index];
    try { await db.StockLedger.delete(movement.ledgerId); } catch {}
    try { if (movement.createdBalance) await db.StockBalance.delete(movement.balanceId); else await db.StockBalance.update(movement.balanceId, { quantity: movement.previous }); } catch {}
  }
}

async function audit(db: any, user: any, branch: any, transfer: any, action: string, requestId = "") {
  await db.AuditLog.create({ user_id: user.id, user_name: userName(user), branch_id: branch.id, entity: "StockTransfer", entity_id: transfer.id, request_id: requestId, action, module: "mutasi", description: `${action} ${transferNumber(transfer)}` });
}

async function nextNumber(db: any, date: string) {
  const day = String(date || new Date().toISOString()).slice(0, 10).replace(/-/g, "");
  return lock(`transfer-number:${day}`, async () => {
    const rows = await db.StockTransfer.list("-created_date", 500);
    const prefix = `TRF-${day}-`;
    const max = rows.reduce((value: number, row: any) => {
      const code = transferNumber(row); if (!code.startsWith(prefix)) return value;
      return Math.max(value, Number(code.slice(prefix.length)) || 0);
    }, 0);
    return `${prefix}${String(max + 1).padStart(4, "0")}`;
  });
}

export async function saveTransferDraft({ payload, user, db }: any) {
  const source = await resolveSourceBranch(user, db);
  const destination = await resolveDestination(String(payload.destination_branch_id || ""), source, db);
  const items = await validateItems(payload.items, db);
  if (payload.transfer_id) {
    return lock(`transfer:${payload.transfer_id}`, async () => {
      const transfer = await one(db.StockTransfer, { id: payload.transfer_id });
      if (!transfer) throw new TransferError("INVALID_TRANSFER", "Draft mutasi tidak ditemukan", 404);
      if (transfer.status !== "draft") throw new TransferError("INVALID_STATUS", "Hanya draft yang dapat diedit", 409);
      if (sourceId(transfer) !== source.id) throw new TransferError("INVALID_TRANSFER", "Draft bukan milik cabang asal user", 403);
      await assertSourcePermission(user, db, source.id, ["can_edit"]);
      const cleanItems = items.map(({ product, ...item }: any) => ({ ...item, approved_qty: 0, received_qty: 0, difference_qty: 0, in_transit_qty: 0 }));
      const updated = await db.StockTransfer.update(transfer.id, { destination_branch_id: destination.id, destination_branch_code: destination.code, destination_branch_name: destination.name, to_branch_id: destination.id, to_branch_code: destination.code, to_branch_name: destination.name, items: cleanItems, total_qty: cleanItems.reduce((sum: number, row: any) => sum + row.qty, 0), notes: String(payload.notes || ""), note: String(payload.notes || "") });
      await audit(db, user, source, updated, "UPDATE_DRAFT");
      return { transfer: updated, idempotent: false };
    });
  }
  await assertSourcePermission(user, db, source.id, ["can_create"]);
  const number = await nextNumber(db, payload.date);
  const cleanItems = items.map(({ product, ...item }: any) => ({ ...item, approved_qty: 0, received_qty: 0, difference_qty: 0, in_transit_qty: 0 }));
  const created = await db.StockTransfer.create({ code: number, transfer_number: number, date: String(payload.date || new Date().toISOString()).slice(0, 10), source_branch_id: source.id, source_branch_code: source.code, source_branch_name: source.name, from_branch_id: source.id, from_branch_code: source.code, from_branch_name: source.name, destination_branch_id: destination.id, destination_branch_code: destination.code, destination_branch_name: destination.name, to_branch_id: destination.id, to_branch_code: destination.code, to_branch_name: destination.name, items: cleanItems, total_qty: cleanItems.reduce((sum: number, row: any) => sum + row.qty, 0), status: "draft", notes: String(payload.notes || ""), note: String(payload.notes || "") });
  await audit(db, user, source, created, "CREATE_TRANSFER");
  return { transfer: created, idempotent: false };
}

export async function approveTransfer({ payload, user, db }: any) {
  const requestId = String(payload.approval_request_id || "").trim();
  if (!requestId) throw new TransferError("DUPLICATE_REQUEST", "Approval request ID wajib tersedia");
  return lock(`transfer:${payload.transfer_id}`, async () => {
    const source = await resolveSourceBranch(user, db);
    const transfer = await one(db.StockTransfer, { id: payload.transfer_id });
    if (!transfer) throw new TransferError("INVALID_TRANSFER", "Mutasi tidak ditemukan", 404);
    if (transfer.status === "approved" && transfer.approval_request_id === requestId) return { transfer, idempotent: true };
    if (transfer.status === "approved" || transfer.status === "received") throw new TransferError("ALREADY_APPROVED", "Mutasi sudah disetujui", 409);
    if (transfer.status !== "draft") throw new TransferError("INVALID_STATUS", "Status mutasi harus draft", 409);
    if (sourceId(transfer) !== source.id) throw new TransferError("INVALID_TRANSFER", "Cabang asal mutasi tidak sesuai user", 403);
    await assertSourcePermission(user, db, source.id, ["can_approve", "can_post"]);
    await resolveDestination(destinationId(transfer), source, db);
    const items = await validateItems(transfer.items, db);
    for (const item of items) { const stock = await resolvedStock(db, source.id, item.product.id); if (stock.quantity < item.qty) throw new TransferError("INSUFFICIENT_STOCK", `Stok ${item.product.name} tidak cukup`, 409); }
    const existingLedger = await db.StockLedger.filter({ ref_id: transfer.id, branch_id: source.id, movement_type: "transfer_out" }, "created_date", 500);
    if (existingLedger.length) throw new TransferError("DUPLICATE_REQUEST", "Movement approval sudah terdeteksi tetapi status belum konsisten", 409);
    const moved = [];
    try {
      for (const item of items) moved.push(await move(db, { branch: source, product: item.product, qty: -item.qty, direction: "transfer_out", transfer, note: `Mutasi keluar ${transferNumber(transfer)}` }));
      const approvedItems = items.map(({ product, ...item }: any) => ({ ...item, approved_qty: item.qty, received_qty: 0, difference_qty: 0, in_transit_qty: item.qty }));
      const updated = await db.StockTransfer.update(transfer.id, { status: "approved", items: approvedItems, approved_at: new Date().toISOString(), approved_by: userName(user), approval_request_id: requestId });
      await audit(db, user, source, updated, "APPROVE_TRANSFER", requestId);
      return { transfer: updated, idempotent: false };
    } catch (error) { await rollbackMovements(db, moved); try { await db.StockTransfer.update(transfer.id, { status: "draft", items: transfer.items, approved_at: "", approved_by: "", approval_request_id: "" }); } catch {} throw error; }
  });
}

export async function receiveTransfer({ payload, user, db }: any) {
  const requestId = String(payload.receiving_request_id || "").trim();
  if (!requestId) throw new TransferError("DUPLICATE_REQUEST", "Receiving request ID wajib tersedia");
  return lock(`transfer:${payload.transfer_id}`, async () => {
    const transfer = await one(db.StockTransfer, { id: payload.transfer_id });
    if (!transfer) throw new TransferError("INVALID_TRANSFER", "Mutasi tidak ditemukan", 404);
    if (transfer.status === "received" && transfer.receiving_request_id === requestId) return { transfer, idempotent: true };
    if (transfer.status === "received") throw new TransferError("ALREADY_RECEIVED", "Mutasi sudah diterima", 409);
    if (transfer.status !== "approved") throw new TransferError("INVALID_STATUS", "Status mutasi harus approved", 409);
    const mappings = await activeMappings(user, db); const destinationBranchId = destinationId(transfer);
    if (!mappings.some((row: any) => row.branch_id === destinationBranchId)) throw new TransferError("UNAUTHORIZED_RECEIVER", "User tidak mempunyai akses aktif ke cabang tujuan", 403);
    const destination = await one(db.Branch, { id: destinationBranchId });
    if (!destination || destination.is_active === false) throw new TransferError("INVALID_DESTINATION_BRANCH", "Cabang tujuan tidak valid");
    const receivedMap = new Map((payload.items || []).map((row: any) => [row.product_id, Number(row.received_qty)]));
    const items = [];
    for (const row of transfer.items || []) {
      const approved = Number(row.approved_qty ?? row.qty ?? 0); const received = receivedMap.get(row.product_id);
      if (received === undefined || !Number.isFinite(received) || received < 0 || received > approved) throw new TransferError("INVALID_RECEIVED_QTY", `Qty diterima ${row.product_name || row.product_id} tidak valid`);
      const product = await one(db.Product, { id: row.product_id }); if (!product) throw new TransferError("INVALID_TRANSFER", "Produk mutasi tidak ditemukan");
      items.push({ ...row, product, approved_qty: approved, received_qty: received, difference_qty: approved - received, in_transit_qty: 0 });
    }
    if (!items.length) throw new TransferError("INVALID_TRANSFER", "Item mutasi kosong");
    const existingLedger = await db.StockLedger.filter({ ref_id: transfer.id, branch_id: destination.id, movement_type: "transfer_in" }, "created_date", 500);
    if (existingLedger.length) throw new TransferError("DUPLICATE_REQUEST", "Movement penerimaan sudah terdeteksi tetapi status belum konsisten", 409);
    const moved = [];
    try {
      for (const item of items) if (item.received_qty > 0) moved.push(await move(db, { branch: destination, product: item.product, qty: item.received_qty, direction: "transfer_in", transfer, note: `Mutasi masuk ${transferNumber(transfer)}` }));
      const cleanItems = items.map(({ product, ...item }: any) => item);
      const updated = await db.StockTransfer.update(transfer.id, { status: "received", items: cleanItems, received_at: new Date().toISOString(), received_by: userName(user), receiving_request_id: requestId, receiving_notes: String(payload.receiving_notes || "") });
      await audit(db, user, destination, updated, "RECEIVE_TRANSFER", requestId);
      return { transfer: updated, idempotent: false };
    } catch (error) { await rollbackMovements(db, moved); try { await db.StockTransfer.update(transfer.id, { status: "approved", items: transfer.items, received_at: "", received_by: "", receiving_request_id: "", receiving_notes: transfer.receiving_notes || "" }); } catch {} throw error; }
  });
}

export async function deleteTransferDraft({ payload, user, db }: any) {
  return lock(`transfer:${payload.transfer_id}`, async () => {
    const source = await resolveSourceBranch(user, db); const transfer = await one(db.StockTransfer, { id: payload.transfer_id });
    if (!transfer) throw new TransferError("INVALID_TRANSFER", "Draft tidak ditemukan", 404);
    if (transfer.status !== "draft") throw new TransferError("INVALID_STATUS", "Mutasi yang sudah approved tidak boleh dihapus", 409);
    if (sourceId(transfer) !== source.id) throw new TransferError("INVALID_TRANSFER", "Draft bukan milik cabang user", 403);
    await assertSourcePermission(user, db, source.id, ["can_cancel"]);
    await audit(db, user, source, transfer, "DELETE_TRANSFER_DRAFT"); await db.StockTransfer.delete(transfer.id);
    return { deleted: true };
  });
}

export function safeTransferError(error: any) {
  if (error instanceof TransferError) return { status: error.status, body: { error: error.code, message: error.message } };
  return { status: 500, body: { error: "INVALID_TRANSFER", message: "Mutasi gagal diproses" } };
}
