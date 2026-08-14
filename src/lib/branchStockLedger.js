import { base44 } from "@/api/base44Client";

const PAGE_SIZE = 500;
const MAX_PAGES = 200;

export async function fetchAllEntityRows(entity, query, sort = "date") {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await entity.filter(query, sort, PAGE_SIZE, page * PAGE_SIZE);
    rows.push(...(batch || []));
    if (!batch || batch.length < PAGE_SIZE) return rows;
  }
  throw new Error(`Histori melebihi ${PAGE_SIZE * MAX_PAGES} record; perhitungan dihentikan agar saldo tidak terpotong.`);
}

export function fetchBranchProductLedger({ branchId, productId }) {
  const query = { product_id: productId };
  if (branchId) query.branch_id = branchId;
  return fetchAllEntityRows(base44.entities.StockLedger, query, "date");
}

export function fetchBranchProductBalances({ branchId, productId }) {
  const query = { product_id: productId };
  if (branchId) query.branch_id = branchId;
  return fetchAllEntityRows(base44.entities.StockBalance, query, "created_date");
}
