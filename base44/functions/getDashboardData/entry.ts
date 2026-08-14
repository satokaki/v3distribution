import { createClientFromRequest } from 'npm:@base44/sdk';

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
      base44.entities.Branch.list("-created_date", 500),
      base44.entities.Product.list("-created_date", 500),
      base44.entities.Customer.list("-created_date", 500),
      base44.entities.Supplier.list("-created_date", 500),
      base44.entities.Salesperson.list("-created_date", 500),
      base44.entities.Account.list("-created_date", 500),
      base44.entities.StockBalance.list("-created_date", 500),
      base44.entities.Sale.list("-created_date", 500),
      base44.entities.Purchase.list("-created_date", 500),
      base44.entities.Receivable.list("-date", 500),
      base44.entities.Payable.list("-date", 500),
      base44.entities.CashTransaction.list("-date", 500),
      base44.entities.StockTransfer.list("-date", 500),
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
