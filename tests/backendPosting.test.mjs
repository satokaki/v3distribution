import test from "node:test";
import assert from "node:assert/strict";
import { postTransaction, PostingError } from "../base44/shared/postingCore.ts";

function database(seed = {}) {
  let sequence = 0;
  const stores = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  return new Proxy({ __stores: stores }, { get(target, name) {
    if (name in target) return target[name];
    const rows = stores[name] ||= [];
    return {
      async filter(query) { return rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)).sort((a,b) => String(a.created_date || "").localeCompare(String(b.created_date || ""))).map((row) => ({ ...row })); },
      async list() { return rows.map((row) => ({ ...row })); },
      async create(data) { const row = { ...data, id: `${String(name)}-${++sequence}`, created_date: `2026-08-14T00:00:${String(sequence).padStart(2,"0")}Z` }; rows.push(row); return { ...row }; },
      async update(id, data) { const row = rows.find((item) => item.id === id); if (!row) throw new Error(`Missing ${String(name)} ${id}`); Object.assign(row, data); return { ...row }; },
      async delete(id) { const index = rows.findIndex((item) => item.id === id); if (index >= 0) rows.splice(index, 1); return { success: true }; },
    };
  }});
}

const user = { id: "USER-1", default_branch_id: "PATRANG", display_name: "Bima" };
const baseSeed = (quantity = 100) => ({
  Branch: [{ id: "PATRANG", code: "PTR", name: "Patrang", is_active: true }, { id: "MASTRIP", code: "MST", name: "Mastrip", is_active: true }],
  UserBranch: [{ id: "UB-1", user_id: "USER-1", branch_id: "PATRANG", status: "active", is_default: true }],
  Product: [{ id: "IZZI", sku: "IZZI-TARO", name: "IZZI Taro", is_active: true, purchase_price: 50 }],
  StockBalance: [{ id: "BAL-1", branch_id: "PATRANG", product_id: "IZZI", balance_scope: "branch", quantity, created_date: "2026-01-01" }],
  Account: [{ id: "KAS-1", branch_id: "PATRANG", name: "Kas Patrang", current_balance: 1000 }],
  Customer: [{ id: "CUS-1", name: "Toko Test", is_active: true, receivable_balance: 0 }],
  Supplier: [{ id: "SUP-1", name: "Supplier Test", is_active: true, debt_balance: 0 }],
});
const salePayload = (request = "SALE-1") => ({ posting_request_id: request, branch_id: "MASTRIP", date: "2026-08-14", payment_method: "tunai", account_id: "KAS-1", total: 100, items: [{ product_id: "IZZI", product_name: "IZZI Taro", sku: "IZZI-TARO", qty: 10, price: 10, subtotal: 100 }] });
const purchasePayload = (request = "PURCHASE-1") => ({ posting_request_id: request, branch_id: "MASTRIP", date: "2026-08-14", payment_method: "kredit", due_date: "2026-08-28", supplier_id: "SUP-1", total: 100, items: [{ product_id: "IZZI", product_name: "IZZI Taro", sku: "IZZI-TARO", qty: 20, price: 5, subtotal: 100 }] });

test("A - payload branch injection is ignored", async () => { const db = database(baseSeed()); const result = await postTransaction({ kind: "sale", payload: salePayload(), user, db }); assert.equal(result.transaction.branch_id, "PATRANG"); });
test("B - normal sale reduces stock 100 to 90", async () => { const db = database(baseSeed()); await postTransaction({ kind: "sale", payload: salePayload(), user, db }); assert.equal(db.__stores.StockBalance[0].quantity, 90); });
test("C - normal purchase increases stock 90 to 110", async () => { const db = database(baseSeed(90)); await postTransaction({ kind: "purchase", payload: purchasePayload(), user, db }); assert.equal(db.__stores.StockBalance[0].quantity, 110); });
test("D - duplicate request posts once", async () => { const db = database(baseSeed()); const payload = salePayload("SAME"); const first = await postTransaction({ kind: "sale", payload, user, db }); const second = await postTransaction({ kind: "sale", payload, user, db }); assert.equal(first.idempotent, false); assert.equal(second.idempotent, true); assert.equal(db.__stores.Sale.length, 1); assert.equal(db.__stores.StockBalance[0].quantity, 90); });
test("E - concurrent first write creates one branch balance", async () => { const seed = baseSeed(); seed.StockBalance = [{ id: "L-A", branch_id: "PATRANG", product_id: "IZZI", warehouse_id: "A", quantity: 60 }, { id: "L-B", branch_id: "PATRANG", product_id: "IZZI", warehouse_id: "B", quantity: 40 }]; const db = database(seed); await Promise.all([postTransaction({ kind: "purchase", payload: purchasePayload("P-1"), user, db }), postTransaction({ kind: "purchase", payload: purchasePayload("P-2"), user, db })]); assert.equal(db.__stores.StockBalance.filter((row) => row.balance_scope === "branch").length, 1); assert.equal(db.__stores.StockBalance.find((row) => row.balance_scope === "branch").quantity, 140); });
test("F - insufficient stock leaves no partial transaction or ledger", async () => { const db = database(baseSeed(5)); await assert.rejects(() => postTransaction({ kind: "sale", payload: salePayload(), user, db }), (error) => error instanceof PostingError && error.code === "INSUFFICIENT_STOCK"); assert.equal((db.__stores.Sale || []).length, 0); assert.equal((db.__stores.StockLedger || []).length, 0); assert.equal(db.__stores.StockBalance[0].quantity, 5); });
test("G - missing user branch is rejected", async () => { const db = database(baseSeed()); await assert.rejects(() => postTransaction({ kind: "sale", payload: salePayload(), user: { id: "NO-BRANCH" }, db }), (error) => error instanceof PostingError && error.code === "BRANCH_NOT_ASSIGNED"); });
test("H - legacy balances seed first branch write", async () => { const seed = baseSeed(); seed.StockBalance = [{ id: "L-A", branch_id: "PATRANG", product_id: "IZZI", warehouse_id: "A", quantity: 60 }, { id: "L-B", branch_id: "PATRANG", product_id: "IZZI", warehouse_id: "B", quantity: 40 }]; const db = database(seed); await postTransaction({ kind: "sale", payload: salePayload(), user, db }); const branchBalance = db.__stores.StockBalance.find((row) => row.balance_scope === "branch"); assert.equal(branchBalance.quantity, 90); assert.equal(db.__stores.StockBalance.find((row) => row.id === "L-A").quantity, 60); assert.equal(db.__stores.StockBalance.find((row) => row.id === "L-B").quantity, 40); });
test("sale cash creates one cash ledger", async () => { const db = database(baseSeed()); await postTransaction({ kind: "sale", payload: salePayload("CASH"), user, db }); assert.equal(db.__stores.CashTransaction.length, 1); assert.equal(db.__stores.Account[0].current_balance, 1100); });
test("sale tempo creates receivable", async () => { const db = database(baseSeed()); const payload = { ...salePayload("TEMPO"), payment_method: "kredit", customer_id: "CUS-1", due_date: "2026-08-28", account_id: "" }; await postTransaction({ kind: "sale", payload, user, db }); assert.equal(db.__stores.Receivable.length, 1); assert.equal(db.__stores.Customer[0].receivable_balance, 100); });
test("purchase legacy first write resolves 100 then adds 20", async () => { const seed = baseSeed(); seed.StockBalance = [{ id: "L-A", branch_id: "PATRANG", product_id: "IZZI", warehouse_id: "A", quantity: 60 }, { id: "L-B", branch_id: "PATRANG", product_id: "IZZI", warehouse_id: "B", quantity: 40 }]; const db = database(seed); await postTransaction({ kind: "purchase", payload: purchasePayload("P-LEGACY"), user, db }); assert.equal(db.__stores.StockBalance.find((row) => row.balance_scope === "branch").quantity, 120); });
test("purchase cash creates outgoing cash ledger", async () => { const db = database(baseSeed(90)); const payload = { ...purchasePayload("P-CASH"), payment_method: "tunai", due_date: "", account_id: "KAS-1" }; await postTransaction({ kind: "purchase", payload, user, db }); assert.equal(db.__stores.StockBalance[0].quantity, 110); assert.equal(db.__stores.CashTransaction.length, 1); assert.equal(db.__stores.Account[0].current_balance, 900); });
test("purchase branch injection is ignored and duplicate request is idempotent", async () => { const db = database(baseSeed(90)); const payload = purchasePayload("P-SAME"); const first = await postTransaction({ kind: "purchase", payload, user, db }); const second = await postTransaction({ kind: "purchase", payload, user, db }); assert.equal(first.transaction.branch_id, "PATRANG"); assert.equal(second.idempotent, true); assert.equal(db.__stores.Purchase.length, 1); assert.equal(db.__stores.StockBalance[0].quantity, 110); });
