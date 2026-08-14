import { createClientFromRequest } from 'npm:@base44/sdk';

const PAGE_SIZE = 500;
const MAX_PAGES = 200;
async function listAll(entity, sort) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await entity.list(sort, PAGE_SIZE, page * PAGE_SIZE);
    rows.push(...(batch || []));
    if (!batch || batch.length < PAGE_SIZE) return rows;
  }
  throw new Error(`DASHBOARD_DATA_LIMIT: ${PAGE_SIZE * MAX_PAGES} records exceeded`);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // User-scoped reads so RLS filters by accessible branches (super admin sees all).
    const [
      branches, products, customers, suppliers, salespersons, accounts,
      stock, sales, purchases, receivables, payables, cashTransactions, stockTransfers,
    ] = await Promise.all([
      listAll(base44.entities.Branch, "-created_date"),
      listAll(base44.entities.Product, "-created_date"),
      listAll(base44.entities.Customer, "-created_date"),
      listAll(base44.entities.Supplier, "-created_date"),
      listAll(base44.entities.Salesperson, "-created_date"),
      listAll(base44.entities.Account, "-created_date"),
      listAll(base44.entities.StockBalance, "-created_date"),
      listAll(base44.entities.Sale, "-created_date"),
      listAll(base44.entities.Purchase, "-created_date"),
      listAll(base44.entities.Receivable, "-date"),
      listAll(base44.entities.Payable, "-date"),
      listAll(base44.entities.CashTransaction, "-date"),
      listAll(base44.entities.StockTransfer, "-date"),
    ]);

    return Response.json({
      branches: branches || [],
      products: products || [],
      customers: customers || [],
      suppliers: suppliers || [],
      salespersons: salespersons || [],
      accounts: accounts || [],
      stock: stock || [],
      sales: sales || [],
      purchases: purchases || [],
      receivables: receivables || [],
      payables: payables || [],
      cashTransactions: cashTransactions || [],
      stockTransfers: stockTransfers || [],
      reconciliationDifference: 0,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
