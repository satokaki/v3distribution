import { isBranchBalance, isLegacyWarehouseBalance, resolveBranchBalanceRows } from "./branchStockBalanceCore.js";
import { buildBranchStockReadModel } from "./branchStockLedgerCore.js";

const keyOf = (row) => `${row.branch_id}:${row.product_id}`;
const number = (value) => Number(value || 0);

export function buildStockReconciliation({ balances = [], ledgerRows = [], products = [], branches = [], warehouses = [], branchIds = null }) {
  const allowed = branchIds ? new Set(branchIds) : null;
  const scoped = (row) => row.branch_id && row.product_id && (!allowed || allowed.has(row.branch_id));
  const balanceGroups = new Map();
  const ledgerGroups = new Map();
  for (const row of balances.filter(scoped)) balanceGroups.set(keyOf(row), [...(balanceGroups.get(keyOf(row)) || []), row]);
  for (const row of ledgerRows.filter(scoped)) ledgerGroups.set(keyOf(row), [...(ledgerGroups.get(keyOf(row)) || []), row]);

  const productMap = new Map(products.map((row) => [row.id, row]));
  const branchMap = new Map(branches.map((row) => [row.id, row]));
  const warehouseIds = new Set(warehouses.map((row) => row.id));
  const keys = new Set([...balanceGroups.keys(), ...ledgerGroups.keys()]);
  const rows = [];

  for (const key of keys) {
    const balanceRows = balanceGroups.get(key) || [];
    const rawLedgerRows = ledgerGroups.get(key) || [];
    const sample = balanceRows[0] || rawLedgerRows[0];
    const branchRows = balanceRows.filter(isBranchBalance);
    const legacyRows = balanceRows.filter(isLegacyWarehouseBalance);
    const legacyAggregate = legacyRows.reduce((sum, row) => sum + number(row.quantity), 0);
    const flags = [];
    if (branchRows.length > 1) flags.push("DUPLICATE_BRANCH_BALANCE");
    if (!productMap.has(sample.product_id)) flags.push("ORPHAN_PRODUCT_REFERENCE");
    if (!branchMap.has(sample.branch_id)) flags.push("ORPHAN_BRANCH_REFERENCE");
    if (legacyRows.some((row) => row.warehouse_id && !warehouseIds.has(row.warehouse_id))) flags.push("ORPHAN_LEGACY_WAREHOUSE_REFERENCE");

    const ambiguous = branchRows.length > 1;
    const resolved = ambiguous ? null : resolveBranchBalanceRows(balanceRows);
    if (!ambiguous && resolved.source === "LEGACY_AGGREGATE" && legacyRows.length) flags.push("LEGACY_ONLY");
    if (!ambiguous && resolved.source === "BRANCH" && !legacyRows.length) flags.push("BRANCH_ONLY");

    const ledgerModel = buildBranchStockReadModel({ ledgerRows: rawLedgerRows });
    const hasLedger = ledgerModel.timelines.length > 0 || ledgerModel.summaries.length > 0;
    const ledgerClosing = hasLedger ? ledgerModel.summaries.reduce((sum, row) => sum + number(row.closing_balance), 0) : null;
    if (ledgerModel.duplicates.length) flags.push("CONFIRMED_DUPLICATE_LEDGER");
    if (ledgerModel.duplicateCandidates.length) flags.push("POSSIBLE_DUPLICATE_LEDGER");
    if (!balanceRows.length && hasLedger) flags.push("ORPHAN_LEDGER");
    if (balanceRows.length && !hasLedger) flags.push("BALANCE_WITHOUT_LEDGER");
    if (!ambiguous && resolved.quantity < 0) flags.push("NEGATIVE_STOCK");

    const resolvedBalance = ambiguous ? null : number(resolved.quantity);
    const difference = resolvedBalance === null ? null : resolvedBalance - number(ledgerClosing);
    const status = !ambiguous && hasLedger && difference === 0 ? "MATCH" : "MISMATCH";
    const product = productMap.get(sample.product_id) || {};
    const branch = branchMap.get(sample.branch_id) || {};
    rows.push({
      id: key, branch_id: sample.branch_id, branch_code: branch.code || sample.branch_code || "", branch_name: branch.name || sample.branch_code || sample.branch_id,
      product_id: sample.product_id, sku: product.sku || sample.sku || "", product_name: product.name || sample.product_name || sample.product_id,
      branch_balance: ambiguous ? null : branchRows.length ? number(branchRows[0].quantity) : null,
      legacy_aggregate: legacyAggregate, resolved_balance: resolvedBalance, ledger_closing: ledgerClosing, difference,
      source: ambiguous ? "AMBIGUOUS" : resolved.source === "BRANCH" ? "BRANCH" : "LEGACY",
      status, flags, branch_balance_count: branchRows.length, branch_balance_records: branchRows,
      legacy_balance_count: legacyRows.length, legacy_balance_records: legacyRows, ledger_movement_count: ledgerModel.timelines.length,
      duplicate_ledgers: ledgerModel.duplicates, duplicate_candidates: ledgerModel.duplicateCandidates,
      latest_movement: ledgerModel.timelines.at(-1) || null,
    });
  }

  const referencedProducts = new Set([...keys].map((key) => key.slice(key.indexOf(":") + 1)));
  const neverStockedProducts = products.filter((product) => product.is_active !== false && !referencedProducts.has(product.id));
  return { rows: rows.sort((a, b) => `${a.branch_name}:${a.product_name}`.localeCompare(`${b.branch_name}:${b.product_name}`)), neverStockedProducts };
}

export function summarizeStockReconciliation(rows = []) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    summary[row.status.toLowerCase()] += 1;
    if (row.flags.includes("LEGACY_ONLY")) summary.legacy_only += 1;
    if (row.flags.some((flag) => flag.includes("DUPLICATE"))) summary.critical += 1;
    if (row.flags.includes("NEGATIVE_STOCK")) summary.negative += 1;
    if (row.flags.some((flag) => flag.startsWith("ORPHAN") || flag === "BALANCE_WITHOUT_LEDGER")) summary.warning += 1;
    return summary;
  }, { total: 0, match: 0, mismatch: 0, legacy_only: 0, critical: 0, negative: 0, warning: 0 });
}

export function filterStockReconciliation(rows = [], { view = "all", search = "" } = {}) {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (view === "match" && row.status !== "MATCH") return false;
    if (view === "mismatch" && row.status !== "MISMATCH") return false;
    if (view === "warning" && !row.flags.length) return false;
    return !query || [row.sku, row.product_name, row.branch_name].some((value) => String(value || "").toLowerCase().includes(query));
  });
}

export function reconciliationExportRows(rows = []) {
  return rows.map((row) => ({ Cabang: row.branch_name, SKU: row.sku, Produk: row.product_name, "Branch Balance": row.branch_balance ?? "AMBIGUOUS", "Legacy Aggregate": row.legacy_aggregate, "Resolved Balance": row.resolved_balance ?? "AMBIGUOUS", "Ledger Closing": row.ledger_closing ?? "NO LEDGER", Difference: row.difference ?? "", Source: row.source, Status: row.status, Flags: row.flags.join(" | ") }));
}
