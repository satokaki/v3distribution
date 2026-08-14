import { base44 } from "@/api/base44Client";

export const AUDIT_PAGE_SIZE = 500;
export const AUDIT_MAX_PAGES = 200;

export async function fetchAllAuditRows(entity, query = {}, sort = "created_date") {
  const rows = [];
  for (let page = 0; page < AUDIT_MAX_PAGES; page += 1) {
    const batch = await entity.filter(query, sort, AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE);
    rows.push(...(batch || []));
    if (!batch || batch.length < AUDIT_PAGE_SIZE) return rows;
  }
  throw new Error(`AUDIT_DATA_LIMIT: data melebihi ${AUDIT_PAGE_SIZE * AUDIT_MAX_PAGES} record; audit dihentikan agar hasil tidak parsial.`);
}

export function fetchStockReconciliationData(branchId = "") {
  const query = branchId ? { branch_id: branchId } : {};
  return Promise.all([
    fetchAllAuditRows(base44.entities.StockBalance, query), fetchAllAuditRows(base44.entities.StockLedger, query, "date"),
    fetchAllAuditRows(base44.entities.Product, {}, "name"), fetchAllAuditRows(base44.entities.Branch, {}, "name"), fetchAllAuditRows(base44.entities.Warehouse, query, "name"),
  ]);
}
