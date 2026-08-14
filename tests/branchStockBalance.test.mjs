import test from "node:test";
import assert from "node:assert/strict";
import { getBranchProductBalance, ensureBranchProductBalance, withBranchStockLock } from "../src/lib/branchStockBalance.js";

function memoryEntity(initial = []) {
  const rows = initial.map((row) => ({ ...row }));
  let sequence = rows.length;
  return {
    rows,
    async filter(query) { return rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)).map((row) => ({ ...row })); },
    async create(data) { const row = { ...data, id: `new-${++sequence}`, created_date: `2026-08-14T00:00:0${sequence}Z` }; rows.push(row); return { ...row }; },
    async update(id, data) { const row = rows.find((item) => item.id === id); Object.assign(row, data); return { ...row }; },
    async delete(id) { const index = rows.findIndex((item) => item.id === id); if (index >= 0) rows.splice(index, 1); return { success: true }; },
  };
}

const branch = { id: "PATRANG", code: "PTR" };
const product = { id: "IZZI", name: "IZZI Taro", sku: "IZZI-TARO", unit: "pcs" };
const legacy = [
  { id: "legacy-a", branch_id: "PATRANG", product_id: "IZZI", warehouse_id: "A", quantity: 60 },
  { id: "legacy-b", branch_id: "PATRANG", product_id: "IZZI", warehouse_id: "B", quantity: 40 },
];

async function movement(entity, delta) {
  return withBranchStockLock(branch.id, product.id, async () => {
    const balance = await ensureBranchProductBalance({ branch, product, entity });
    const quantity = Number(balance.quantity || 0) + delta;
    await entity.update(balance.id, { quantity });
    return quantity;
  });
}

test("A - legacy only resolves aggregate", async () => {
  const resolved = await getBranchProductBalance(branch.id, product.id, memoryEntity(legacy));
  assert.equal(resolved.quantity, 100); assert.equal(resolved.source, "LEGACY_AGGREGATE");
});

test("B - branch balance overrides legacy", async () => {
  const entity = memoryEntity([...legacy, { id: "branch", branch_id: "PATRANG", product_id: "IZZI", balance_scope: "branch", quantity: 90 }]);
  const resolved = await getBranchProductBalance(branch.id, product.id, entity);
  assert.equal(resolved.quantity, 90); assert.notEqual(resolved.quantity, 190); assert.equal(resolved.source, "BRANCH");
});

test("C - first write seeds legacy aggregate then applies sale", async () => {
  const entity = memoryEntity(legacy); assert.equal(await movement(entity, -10), 90);
  const branchRows = entity.rows.filter((row) => row.balance_scope === "branch"); assert.equal(branchRows.length, 1); assert.equal(branchRows[0].quantity, 90);
});

test("D - purchase increments existing branch balance", async () => {
  const entity = memoryEntity([{ id: "branch", branch_id: "PATRANG", product_id: "IZZI", balance_scope: "branch", quantity: 90 }]);
  assert.equal(await movement(entity, 20), 110);
});

test("E - in-process duplicate guard creates one branch balance", async () => {
  const entity = memoryEntity(legacy);
  await Promise.all([movement(entity, -10), movement(entity, 20)]);
  const branchRows = entity.rows.filter((row) => row.balance_scope === "branch"); assert.equal(branchRows.length, 1); assert.equal(branchRows[0].quantity, 110);
});

test("F - legacy records remain unchanged", async () => {
  const entity = memoryEntity(legacy); const snapshot = JSON.stringify(entity.rows); await movement(entity, -10);
  assert.equal(JSON.stringify(entity.rows.filter((row) => row.warehouse_id)), snapshot);
});
