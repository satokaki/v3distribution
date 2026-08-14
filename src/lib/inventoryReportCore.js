import { resolveBranchInventory } from "./branchStockBalanceCore.js";

export const INVENTORY_TYPES = ["Semua", "Liquid", "Device", "Cartridge", "Aksesoris", "Lainnya"];
export const INVENTORY_STATUSES = ["Semua", "AMAN", "MENIPIS", "HABIS"];

export function normalizeInventoryType(value = "") {
  const type = String(value).toLowerCase();
  if (type.includes("liquid")) return "Liquid";
  if (type.includes("device")) return "Device";
  if (type.includes("cartridge") || type.includes("catridge")) return "Cartridge";
  if (type.includes("aksesor")) return "Aksesoris";
  return "Lainnya";
}

export function buildInventoryReport({ balances = [], products = [], branchIds = null, branches = [] }) {
  const branchNames = new Map(branches.map((branch) => [branch.id || branch.branch_id, branch.name || branch.branch_name]));
  return resolveBranchInventory({ balances, products, branchIds }).map((row) => ({
    ...row,
    branch_name: branchNames.get(row.branch_id) || row.branch_code || "—",
    type_label: normalizeInventoryType(row.product_type),
  }));
}

export function filterInventoryReport(rows = [], { type = "Semua", status = "Semua", search = "" } = {}) {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (type !== "Semua" && row.type_label !== type) return false;
    if (status !== "Semua" && row.status !== status) return false;
    if (!query) return true;
    return [row.sku, row.product_name, row.brand, row.category_name, row.branch_name]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
}

export function summarizeInventoryReport(rows = []) {
  return rows.reduce((summary, row) => {
    summary.item_rows += 1;
    summary.total_quantity += Number(row.quantity || 0);
    summary.inventory_value += Number(row.inventory_value || 0);
    if (row.status === "MENIPIS") summary.low_stock += 1;
    if (row.status === "HABIS") summary.out_of_stock += 1;
    return summary;
  }, { item_rows: 0, total_quantity: 0, inventory_value: 0, low_stock: 0, out_of_stock: 0 });
}

export function inventoryReportExportRows(rows = [], { includeBranch = false } = {}) {
  return rows.map((row) => ({
    SKU: row.sku,
    Produk: row.product_name,
    Brand: row.brand,
    Kategori: row.category_name || row.type_label,
    ...(includeBranch ? { Cabang: row.branch_name } : {}),
    Qty: row.quantity,
    Minimum: row.min_stock,
    Status: row.status,
    "HPP / Unit": row.unit_cost,
    "Nilai Persediaan": row.inventory_value,
  }));
}
