import { resolveBranchInventory } from "./branchStockBalanceCore.js";

export function jakartaBusinessDate(value = new Date()) {
  if (value instanceof Date) return value.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const raw = String(value || "");
  if (!raw || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export function resolveDashboardInventory({ balances = [], products = [], branchIds = null }) {
  return resolveBranchInventory({ balances, products, branchIds });
}

export function dashboardInventorySummary(rows = []) {
  return rows.reduce((summary, row) => {
    summary.quantity += Number(row.quantity || 0);
    summary.inventory_value += Number(row.inventory_value || 0);
    if (row.status === "MENIPIS" || row.status === "HABIS") summary.low_stock += 1;
    return summary;
  }, { quantity: 0, inventory_value: 0, low_stock: 0 });
}

export const transferSourceId = (row) => row.source_branch_id || row.from_branch_id || "";
export const transferDestinationId = (row) => row.destination_branch_id || row.to_branch_id || "";
export const transferTransitQty = (row) => (row.items || []).reduce((sum, item) => sum + Number(item.in_transit_qty || 0), 0);

export function dashboardTransferSummary(transfers = [], branchIds = null) {
  const allowed = branchIds ? new Set(branchIds) : null;
  const approved = transfers.filter((row) => row.status === "approved");
  const incoming = approved.filter((row) => !allowed || allowed.has(transferDestinationId(row)));
  const outgoing = approved.filter((row) => !allowed || allowed.has(transferSourceId(row)));
  const relevant = approved.filter((row) => !allowed || allowed.has(transferSourceId(row)) || allowed.has(transferDestinationId(row)));
  return {
    incoming_count: incoming.length,
    incoming_qty: incoming.reduce((sum, row) => sum + transferTransitQty(row), 0),
    outgoing_count: outgoing.length,
    outgoing_qty: outgoing.reduce((sum, row) => sum + transferTransitQty(row), 0),
    transit_count: relevant.length,
    transit_qty: relevant.reduce((sum, row) => sum + transferTransitQty(row), 0),
  };
}

export function isPostedOn(record, day) {
  return record.status === "posted" && jakartaBusinessDate(record.date || record.transaction_date || record.created_date) === day;
}

export function isPostedInMonth(record, month) {
  return record.status === "posted" && jakartaBusinessDate(record.date || record.transaction_date || record.created_date).startsWith(month);
}

export function buildDashboardBranchRows({ branches = [], inventory = [], sales = [], receivables = [], transfers = [], today = jakartaBusinessDate() }) {
  const month = today.slice(0, 7);
  return branches.map((branch) => {
    const branchInventory = inventory.filter((row) => row.branch_id === branch.id);
    const stock = dashboardInventorySummary(branchInventory);
    const branchSales = sales.filter((row) => row.branch_id === branch.id);
    const branchReceivables = receivables.filter((row) => row.branch_id === branch.id && row.status !== "paid");
    const transit = dashboardTransferSummary(transfers, [branch.id]);
    return {
      id: branch.id, code: branch.code, name: branch.name,
      sales_today: branchSales.filter((row) => isPostedOn(row, today)).reduce((sum, row) => sum + Number(row.total || 0), 0),
      sales_month: branchSales.filter((row) => isPostedInMonth(row, month)).reduce((sum, row) => sum + Number(row.total || 0), 0),
      receivable: branchReceivables.reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0) - Number(row.paid_amount || 0)), 0),
      inventory_value: stock.inventory_value,
      low_stock: stock.low_stock,
      transit_count: transit.transit_count,
      transit_qty: transit.transit_qty,
    };
  });
}
