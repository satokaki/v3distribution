import { base44 } from "@/api/base44Client";

export const REPORT_PAGE_SIZE = 500;
export const REPORT_MAX_PAGES = 200;

export async function fetchAllReportRows(entity, query = {}, sort = "created_date") {
  const rows = [];
  for (let page = 0; page < REPORT_MAX_PAGES; page += 1) {
    const batch = await entity.filter(query, sort, REPORT_PAGE_SIZE, page * REPORT_PAGE_SIZE);
    rows.push(...(batch || []));
    if (!batch || batch.length < REPORT_PAGE_SIZE) return rows;
  }
  throw new Error(`REPORT_DATA_LIMIT: data melebihi ${REPORT_PAGE_SIZE * REPORT_MAX_PAGES} record; laporan dihentikan agar hasil tidak terpotong.`);
}

export function fetchInventoryReportData(branchId = "") {
  const stockQuery = branchId ? { branch_id: branchId } : {};
  return Promise.all([
    fetchAllReportRows(base44.entities.StockBalance, stockQuery, "product_name"),
    fetchAllReportRows(base44.entities.Product, {}, "name"),
  ]);
}
