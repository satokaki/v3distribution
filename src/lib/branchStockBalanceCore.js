export const BRANCH_SCOPE = "branch";
export const LEGACY_SCOPE = "warehouse_legacy";

export function isBranchBalance(row) {
  return row?.balance_scope === BRANCH_SCOPE;
}

export function isLegacyWarehouseBalance(row) {
  return !isBranchBalance(row) && Boolean(row?.warehouse_id);
}

export function resolveBranchBalanceRows(rows = []) {
  const branchRows = rows.filter(isBranchBalance);
  const legacyRows = rows.filter(isLegacyWarehouseBalance);
  const legacyAggregate = legacyRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  if (branchRows.length) {
    const canonical = [...branchRows].sort((a, b) => String(a.created_date || a.id || "").localeCompare(String(b.created_date || b.id || "")))[0];
    return { quantity: Number(canonical.quantity || 0), source: "BRANCH", balance: canonical, branchRows, legacyRows, legacyAggregate };
  }

  return { quantity: legacyAggregate, source: "LEGACY_AGGREGATE", balance: null, branchRows, legacyRows, legacyAggregate };
}

export function buildBranchBalanceRecord({ branch, product, quantity }) {
  return {
    product_id: product.product_id || product.id,
    product_name: product.product_name || product.name,
    sku: product.sku,
    branch_id: branch.id,
    branch_code: branch.code,
    balance_scope: BRANCH_SCOPE,
    warehouse_id: null,
    warehouse_name: "",
    quantity: Number(quantity || 0),
    unit: product.unit || "pcs",
    min_stock: product.min_stock || 0,
  };
}

export function stockStatus(quantity, minimum) {
  if (Number(quantity || 0) <= 0) return "HABIS";
  if (Number(quantity || 0) <= Number(minimum || 0)) return "MENIPIS";
  return "AMAN";
}

export function resolveBranchInventory({ balances = [], products = [], branchIds = null }) {
  const allowed = branchIds ? new Set(branchIds) : null;
  const productMap = new Map(products.map((product) => [product.id, product]));
  const groups = new Map();
  for (const row of balances) {
    if (!row.branch_id || !row.product_id || (allowed && !allowed.has(row.branch_id))) continue;
    const key = `${row.branch_id}:${row.product_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.entries()].map(([key, rows]) => {
    const resolved = resolveBranchBalanceRows(rows);
    const product = productMap.get(rows[0].product_id) || {};
    const quantity = resolved.quantity;
    const minimum = Number(product.min_stock ?? rows[0].min_stock ?? 0);
    const unitCost = Number(product.purchase_price || 0);
    return {
      id: key,
      branch_id: rows[0].branch_id,
      branch_code: rows.find((row) => row.branch_code)?.branch_code || "",
      product_id: rows[0].product_id,
      product_name: product.name || rows[0].product_name || "",
      sku: product.sku || rows[0].sku || "",
      brand: product.brand || "",
      category_name: product.category_name || "",
      product_type: product.product_type || product.category_name || "Lainnya",
      unit: product.unit || rows[0].unit || "pcs",
      quantity,
      min_stock: minimum,
      unit_cost: unitCost,
      inventory_value: quantity * unitCost,
      status: stockStatus(quantity, minimum),
      balance_source: resolved.source,
    };
  }).sort((a, b) => `${a.product_name}:${a.branch_code}`.localeCompare(`${b.product_name}:${b.branch_code}`));
}
