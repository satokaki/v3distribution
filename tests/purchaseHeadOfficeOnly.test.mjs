import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { postTransaction, PostingError } from "../base44/shared/postingCore.ts";
import { savePurchaseDraft } from "../base44/shared/purchaseDraftCore.ts";

function database(seed = {}) {
  let sequence = 0;
  const stores = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  return new Proxy({ __stores: stores }, { get(target, name) {
    if (name in target) return target[name];
    const rows = stores[name] ||= [];
    return {
      async filter(query) { return rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)).map((row) => ({ ...row })); },
      async list() { return rows.map((row) => ({ ...row })); },
      async create(data) { const row = { ...data, id: `${String(name)}-${++sequence}` }; rows.push(row); return { ...row }; },
      async update(id, data) { const row = rows.find((item) => item.id === id); if (!row) throw new Error(`Missing ${String(name)} ${id}`); Object.assign(row, data); return { ...row }; },
      async delete(id) { const index = rows.findIndex((item) => item.id === id); if (index >= 0) rows.splice(index, 1); return { success: true }; },
    };
  }});
}

const centralAdmin = { id: "ADMIN", role: "admin", app_role: "super_admin", default_branch_id: "PUSAT" };
const retailUser = { id: "RETAIL-USER", role: "user", app_role: "admin_cabang", default_branch_id: "RETAIL" };
const seed = () => ({
  Branch: [
    { id: "PUSAT", code: "PST", name: "Head Office", branch_type: "pusat", is_active: true },
    { id: "RETAIL", code: "RTL", name: "Retail", branch_type: "cabang", is_active: true },
  ],
  UserBranch: [
    { id: "UB-A", user_id: "ADMIN", branch_id: "PUSAT", status: "active", is_default: true },
    { id: "UB-R", user_id: "RETAIL-USER", branch_id: "RETAIL", status: "active", is_default: true },
  ],
  Product: [{ id: "PROD", sku: "SKU", name: "Produk", is_active: true, purchase_price: 10 }],
  StockBalance: [{ id: "BAL", branch_id: "PUSAT", product_id: "PROD", balance_scope: "branch", quantity: 10 }],
  StockLedger: [], Purchase: [], Payable: [], CashTransaction: [], AuditLog: [],
  Account: [{ id: "ACC", branch_id: "PUSAT", name: "Kas Pusat", current_balance: 1000 }],
  Supplier: [{ id: "SUP", name: "Supplier", is_active: true, debt_balance: 0 }],
});
const payload = (branchId, request = "REQ-1") => ({ posting_request_id: request, branch_id: branchId, date: "2026-08-15", supplier_id: "SUP", payment_method: "kredit", due_date: "2026-08-30", total: 50, items: [{ product_id: "PROD", qty: 5, price: 10, subtotal: 50 }] });

test("PURCHASE_HEAD_OFFICE_ONLY - direct backend retail payload ditolak tanpa side effect", async () => {
  const db = database(seed());
  await assert.rejects(() => postTransaction({ kind: "purchase", payload: payload("RETAIL"), user: centralAdmin, db }), (error) => error instanceof PostingError && error.code === "PURCHASE_HEAD_OFFICE_ONLY");
  assert.equal(db.__stores.Purchase.length, 0);
  assert.equal(db.__stores.StockLedger.length, 0);
  assert.equal(db.__stores.StockBalance[0].quantity, 10);
  assert.equal(db.__stores.Payable.length, 0);
  assert.equal(db.__stores.Supplier[0].debt_balance, 0);
  assert.equal(db.__stores.CashTransaction.length, 0);
  assert.equal(db.__stores.Account[0].current_balance, 1000);
  assert.equal(db.__stores.AuditLog.length, 0);
});

test("PURCHASE_HEAD_OFFICE_ONLY - user retail tidak dapat menyuntik branch Pusat", async () => {
  const db = database(seed());
  await assert.rejects(() => postTransaction({ kind: "purchase", payload: payload("PUSAT"), user: retailUser, db }), (error) => error instanceof PostingError && error.code === "PURCHASE_HEAD_OFFICE_ONLY");
  assert.equal(db.__stores.Purchase.length, 0);
  assert.equal(db.__stores.StockLedger.length, 0);
});

test("Purchase Pusat dapat dibuat dan diposting normal", async () => {
  const db = database(seed());
  const result = await postTransaction({ kind: "purchase", payload: payload("PUSAT"), user: centralAdmin, db });
  assert.equal(result.transaction.branch_id, "PUSAT");
  assert.equal(db.__stores.StockBalance[0].quantity, 15);
  assert.equal(db.__stores.Payable.length, 1);
});

test("draft retail ditolak backend sebelum Purchase dibuat", async () => {
  const db = database(seed());
  await assert.rejects(() => savePurchaseDraft({ payload: { ...payload("RETAIL"), code: "DRF-1" }, user: centralAdmin, db }), (error) => error instanceof PostingError && error.code === "PURCHASE_HEAD_OFFICE_ONLY");
  assert.equal(db.__stores.Purchase.length, 0);
});

test("draft Pusat dibuat melalui backend dan tidak mengubah stok/keuangan", async () => {
  const db = database(seed());
  const result = await savePurchaseDraft({ payload: { ...payload("PUSAT"), code: "DRF-1" }, user: centralAdmin, db });
  assert.equal(result.purchase.status, "draft");
  assert.equal(result.purchase.branch_id, "PUSAT");
  assert.equal(db.__stores.StockBalance[0].quantity, 10);
  assert.equal(db.__stores.StockLedger.length, 0);
  assert.equal(db.__stores.Payable.length, 0);
  assert.equal(db.__stores.Account[0].current_balance, 1000);
});

test("frontend Purchase tidak lagi create/update/delete draft langsung", () => {
  for (const file of ["../src/pages/PurchasePOSNew.jsx", "../src/pages/Pembelian.jsx"]) {
    const code = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(code, /entities\.Purchase\.(create|update|delete)/);
  }
  const page = fs.readFileSync(new URL("../src/pages/PurchasePOSNew.jsx", import.meta.url), "utf8");
  assert.match(page, /branch_type === "pusat"/);
  assert.match(page, /Pembelian supplier hanya dapat dilakukan dari Pusat/);
});

test("canonical pusat memakai Branch.branch_type dan tidak hard-code nama/kode/id", () => {
  const posting = fs.readFileSync(new URL("../base44/shared/postingCore.ts", import.meta.url), "utf8");
  assert.match(posting, /branch\.branch_type !== "pusat"/);
  assert.doesNotMatch(posting, /V3 DISTRIBUTION|PUFF CORNER|CBG-0002/);
  const schema = JSON.parse(fs.readFileSync(new URL("../base44/entities/Branch.jsonc", import.meta.url), "utf8"));
  assert.deepEqual(schema.properties.branch_type.enum, ["pusat", "cabang"]);
});

test("Purchase write RLS menolak user retail direct entity write", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("../base44/entities/Purchase.jsonc", import.meta.url), "utf8"));
  assert.deepEqual(schema.rls.create, { user_condition: { role: "admin" } });
  assert.deepEqual(schema.rls.update, { user_condition: { role: "admin" } });
  assert.deepEqual(schema.rls.delete, { user_condition: { role: "admin" } });
});
