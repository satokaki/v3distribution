import { BRANCH_SCOPE, buildBranchBalanceRecord, resolveBranchBalanceRows } from "./branchStockBalanceCore.js";

const locks = new Map();
const keyFor = (branchId, productId) => `${branchId}:${productId}`;

export async function withBranchStockLock(branchId, productId, task) {
  const key = keyFor(branchId, productId);
  const previous = locks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  locks.set(key, current);
  try { return await current; }
  finally { if (locks.get(key) === current) locks.delete(key); }
}

async function listProductBalances(entity, branchId, productId) {
  return entity.filter({ branch_id: branchId, product_id: productId }, "created_date", 500);
}

async function stockBalanceEntity(entity) {
  if (entity) return entity;
  const { base44 } = await import("../api/base44Client.js");
  return base44.entities.StockBalance;
}

export async function getBranchProductBalance(branchId, productId, entity = null) {
  const target = await stockBalanceEntity(entity);
  const rows = await listProductBalances(target, branchId, productId);
  return resolveBranchBalanceRows(rows || []);
}

export async function getBranchProductBalanceDiagnostic(branchId, productId, entity = null) {
  const resolved = await getBranchProductBalance(branchId, productId, entity);
  return {
    branch_id: branchId,
    product_id: productId,
    legacy: resolved.legacyRows.map((row) => ({ id: row.id, warehouse_id: row.warehouse_id, warehouse_name: row.warehouse_name, quantity: Number(row.quantity || 0) })),
    legacy_aggregate: resolved.legacyAggregate,
    branch_balance: resolved.balance ? Number(resolved.balance.quantity || 0) : null,
    resolved_balance: resolved.quantity,
    source: resolved.source,
    duplicate_branch_balances: Math.max(0, resolved.branchRows.length - 1),
  };
}

export async function ensureBranchProductBalance({ branch, product, entity = null }) {
  entity = await stockBalanceEntity(entity);
  const productId = product.product_id || product.id;
  let resolved = await getBranchProductBalance(branch.id, productId, entity);
  if (resolved.balance) {
    if (resolved.branchRows.length > 1) throw new Error(`Duplikat saldo branch terdeteksi untuk ${branch.id}/${productId}`);
    return resolved.balance;
  }

  // Re-check immediately before create to reduce cross-request first-write races.
  resolved = await getBranchProductBalance(branch.id, productId, entity);
  if (resolved.balance) return resolved.balance;

  const created = await entity.create(buildBranchBalanceRecord({ branch, product, quantity: resolved.legacyAggregate }));
  const afterCreate = await getBranchProductBalance(branch.id, productId, entity);
  if (afterCreate.branchRows.length <= 1) return created;

  // Concurrent creators choose the oldest record as canonical. A losing creator
  // removes only the duplicate it just created; warehouse legacy rows are untouched.
  if (afterCreate.balance.id !== created.id) {
    await entity.delete(created.id);
    return afterCreate.balance;
  }
  throw new Error(`Concurrent duplicate saldo branch terdeteksi untuk ${branch.id}/${productId}; transaksi dihentikan untuk mencegah saldo ambigu.`);
}

export { BRANCH_SCOPE };
