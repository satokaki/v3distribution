import { base44 } from "@/api/base44Client";
import { applyStockMovement } from "@/lib/stockPosting";
import { writeAuditLog } from "@/lib/audit";
import { generateCode } from "@/lib/utils";

/** Generate a sequential code based on current record count (best-effort, client-side). */
async function seqCode(entityName, prefix, pad = 5) {
  const list = await base44.entities[entityName].list("-created_date", 500);
  return generateCode(prefix, (list || []).length, pad);
}

/** Create a CashTransaction and update the related Account balance. Returns { id, balanceAfter }. */
export async function createCashTransaction({ date, account, branch, type, category, amount, refType, refId, refCode, description }) {
  const prevBalance = account.current_balance || 0;
  const balanceAfter = prevBalance + (type === "in" ? amount : -amount);
  const code = await seqCode("CashTransaction", "KAS");
  const created = await base44.entities.CashTransaction.create({
    code,
    date,
    account_id: account.id,
    account_name: account.name,
    branch_id: branch.id,
    branch_code: branch.code,
    type,
    category: category || "Lain-lain",
    amount,
    balance_after: balanceAfter,
    ref_type: refType,
    ref_id: refId,
    ref_code: refCode,
    description,
  });
  await base44.entities.Account.update(account.id, { current_balance: balanceAfter });
  return { id: created.id, balanceAfter, prevBalance };
}

/** Reverse a stock movement (used for compensating rollback). */
async function reverseMovement({ product, branch, warehouse, qty, refType, refId, refCode, note }) {
  try {
    await applyStockMovement({
      product, branch, warehouse, type: "adjustment", direction: "in", qty,
      refType, refId, refCode, note,
    });
  } catch { /* best-effort */ }
}

/**
 * Post a Sale atomically (best-effort with rollback).
 * - Pre-validates stock availability
 * - Reduces stock + writes ledger
 * - Tunai: creates CashTransaction (in) + updates Account
 * - Kredit: creates Receivable + updates Customer.receivable_balance
 * - Creates Commission (rate snapshot) if salesperson has a rate
 * - Writes AuditLog
 */
export async function postSale(payload) {
  const branch = { id: payload.branch_id, code: payload.branch_code };
  const warehouse = { id: payload.warehouse_id, name: payload.warehouse_name };
  const items = payload.items || [];
  const paymentMethod = payload.payment_method || "tunai";

  // Pre-flight stock validation
  for (const item of items) {
    const balances = await base44.entities.StockBalance.filter({ product_id: item.product_id, warehouse_id: warehouse.id });
    const avail = balances[0] ? balances[0].quantity : 0;
    if (avail < (item.qty || 0)) {
      throw new Error(`Stok ${item.product_name || item.sku} tidak cukup (tersedia ${avail}, butuh ${item.qty})`);
    }
  }

  const saleCode = await seqCode("Sale", "PEN");
  const created = await base44.entities.Sale.create({ ...payload, code: saleCode, status: "posted" });

  const moved = [];
  let cashTxId = null;
  let accountReversed = false;
  let receivableId = null;
  let commissionId = null;
  let customerUpdatedId = null;
  let customerPrevBalance = 0;

  try {
    for (const item of items) {
      const product = { product_id: item.product_id, product_name: item.product_name, sku: item.sku };
      await applyStockMovement({
        product, branch, warehouse, type: "out", qty: item.qty,
        refType: "sale", refId: created.id, refCode: saleCode, note: `Penjualan ${saleCode}`,
      });
      moved.push(item);
    }

    const total = payload.total || 0;

    if (paymentMethod === "tunai" && payload.account_id) {
      const acc = (await base44.entities.Account.filter({ id: payload.account_id }))[0];
      if (acc) {
        const res = await createCashTransaction({
          date: payload.date, account: acc, branch, type: "in", category: "Penjualan",
          amount: total, refType: "sale", refId: created.id, refCode: saleCode,
          description: `Penjualan tunai ${saleCode}`,
        });
        cashTxId = res.id;
        accountReversed = { id: acc.id, prev: res.prevBalance };
      }
    } else if (paymentMethod === "kredit") {
      const rCode = await seqCode("Receivable", "PTG");
      const rv = await base44.entities.Receivable.create({
        code: rCode, date: payload.date, due_date: payload.due_date || "",
        customer_id: payload.customer_id, customer_name: payload.customer_name,
        branch_id: payload.branch_id, branch_code: payload.branch_code,
        source: "sale", ref_type: "sale", ref_id: created.id, ref_code: saleCode,
        amount: total, paid_amount: 0, status: "unpaid",
      });
      receivableId = rv.id;
      if (payload.customer_id) {
        const cust = (await base44.entities.Customer.filter({ id: payload.customer_id }))[0];
        if (cust) {
          customerPrevBalance = cust.receivable_balance || 0;
          await base44.entities.Customer.update(cust.id, { receivable_balance: customerPrevBalance + total });
          customerUpdatedId = cust.id;
        }
      }
    }

    if (payload.salesperson_id) {
      const sp = (await base44.entities.Salesperson.filter({ id: payload.salesperson_id }))[0];
      const rate = sp?.commission_rate || 0;
      if (rate > 0) {
        const cCode = await seqCode("Commission", "KMS");
        const cm = await base44.entities.Commission.create({
          code: cCode, date: payload.date,
          salesperson_id: payload.salesperson_id, salesperson_name: payload.salesperson_name,
          branch_id: payload.branch_id, branch_code: payload.branch_code,
          sale_id: created.id, sale_code: saleCode, sale_total: total,
          rate, amount: Math.round(total * rate / 100), status: "accrued",
        });
        commissionId = cm.id;
      }
    }

    await writeAuditLog({ action: "post_sale", module: "penjualan", description: `Posting penjualan ${saleCode} (${paymentMethod})`, branchId: payload.branch_id });
    return created;
  } catch (err) {
    // Compensating rollback
    for (const item of moved) {
      await reverseMovement({
        product: { product_id: item.product_id, product_name: item.product_name, sku: item.sku },
        branch, warehouse, qty: item.qty,
        refType: "sale_rollback", refId: created.id, refCode: saleCode, note: `Rollback penjualan ${saleCode}`,
      });
    }
    if (cashTxId) { try { await base44.entities.CashTransaction.delete(cashTxId); } catch {} }
    if (accountReversed) { try { await base44.entities.Account.update(accountReversed.id, { current_balance: accountReversed.prev }); } catch {} }
    if (receivableId) { try { await base44.entities.Receivable.delete(receivableId); } catch {} }
    if (commissionId) { try { await base44.entities.Commission.delete(commissionId); } catch {} }
    if (customerUpdatedId) { try { await base44.entities.Customer.update(customerUpdatedId, { receivable_balance: customerPrevBalance }); } catch {} }
    try { await base44.entities.Sale.delete(created.id); } catch {}
    throw err;
  }
}

/**
 * Post a Purchase atomically (best-effort with rollback).
 * - Increases stock + writes ledger
 * - Tunai: creates CashTransaction (out) + updates Account
 * - Kredit: creates Payable + updates Supplier.debt_balance
 * - Updates Product.purchase_price (last purchase price)
 * - Writes AuditLog
 */
export async function postPurchase(payload) {
  const branch = { id: payload.branch_id, code: payload.branch_code };
  const warehouse = { id: payload.warehouse_id, name: payload.warehouse_name };
  const items = payload.items || [];
  const paymentMethod = payload.payment_method || "tunai";

  const purCode = await seqCode("Purchase", "PMB");
  const created = await base44.entities.Purchase.create({ ...payload, code: purCode, status: "posted" });

  const moved = [];
  let cashTxId = null;
  let accountReversed = null;
  let payableId = null;
  let supplierUpdatedId = null;
  let supplierPrevBalance = 0;
  const priceUpdates = []; // [{ productId, prevPrice }]

  try {
    for (const item of items) {
      const product = { product_id: item.product_id, product_name: item.product_name, sku: item.sku };
      await applyStockMovement({
        product, branch, warehouse, type: "in", qty: item.qty,
        refType: "purchase", refId: created.id, refCode: purCode, note: `Pembelian ${purCode}`,
      });
      moved.push(item);
    }

    const total = payload.total || 0;

    if (paymentMethod === "tunai" && payload.account_id) {
      const acc = (await base44.entities.Account.filter({ id: payload.account_id }))[0];
      if (acc) {
        const res = await createCashTransaction({
          date: payload.date, account: acc, branch, type: "out", category: "Pembelian",
          amount: total, refType: "purchase", refId: created.id, refCode: purCode,
          description: `Pembelian tunai ${purCode}`,
        });
        cashTxId = res.id;
        accountReversed = { id: acc.id, prev: res.prevBalance };
      }
    } else if (paymentMethod === "kredit") {
      const pCode = await seqCode("Payable", "HTG");
      const pv = await base44.entities.Payable.create({
        code: pCode, date: payload.date, due_date: payload.due_date || "",
        supplier_id: payload.supplier_id, supplier_name: payload.supplier_name,
        branch_id: payload.branch_id, branch_code: payload.branch_code,
        source: "purchase", ref_type: "purchase", ref_id: created.id, ref_code: purCode,
        amount: total, paid_amount: 0, status: "unpaid",
      });
      payableId = pv.id;
      if (payload.supplier_id) {
        const sup = (await base44.entities.Supplier.filter({ id: payload.supplier_id }))[0];
        if (sup) {
          supplierPrevBalance = sup.debt_balance || 0;
          await base44.entities.Supplier.update(sup.id, { debt_balance: supplierPrevBalance + total });
          supplierUpdatedId = sup.id;
        }
      }
    }

    // Update last purchase price per product
    for (const item of items) {
      if (!item.product_id || item.price == null) continue;
      const prod = (await base44.entities.Product.filter({ id: item.product_id }))[0];
      if (prod) {
        priceUpdates.push({ id: prod.id, prev: prod.purchase_price });
        await base44.entities.Product.update(prod.id, { purchase_price: Number(item.price) || 0 });
      }
    }

    await writeAuditLog({ action: "post_purchase", module: "pembelian", description: `Posting pembelian ${purCode} (${paymentMethod})`, branchId: payload.branch_id });
    return created;
  } catch (err) {
    // Compensating rollback
    for (const item of moved) {
      await reverseMovement({
        product: { product_id: item.product_id, product_name: item.product_name, sku: item.sku },
        branch, warehouse, qty: item.qty,
        refType: "purchase_rollback", refId: created.id, refCode: purCode, note: `Rollback pembelian ${purCode}`,
      });
    }
    if (cashTxId) { try { await base44.entities.CashTransaction.delete(cashTxId); } catch {} }
    if (accountReversed) { try { await base44.entities.Account.update(accountReversed.id, { current_balance: accountReversed.prev }); } catch {} }
    if (payableId) { try { await base44.entities.Payable.delete(payableId); } catch {} }
    if (supplierUpdatedId) { try { await base44.entities.Supplier.update(supplierUpdatedId, { debt_balance: supplierPrevBalance }); } catch {} }
    for (const pu of priceUpdates) { try { await base44.entities.Product.update(pu.id, { purchase_price: pu.prev }); } catch {} }
    try { await base44.entities.Purchase.delete(created.id); } catch {}
    throw err;
  }
}