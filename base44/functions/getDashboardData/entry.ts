import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // User-scoped reads so RLS filters by accessible branches (super admin sees all).
    const branches = await base44.entities.Branch.list("-created_date", 500);
    const products = await base44.entities.Product.list("-created_date", 500);
    const customers = await base44.entities.Customer.list("-created_date", 500);
    const suppliers = await base44.entities.Supplier.list("-created_date", 500);
    const salespersons = await base44.entities.Salesperson.list("-created_date", 500);
    const accounts = await base44.entities.Account.list("-created_date", 500);
    const stock = await base44.entities.StockBalance.list("-created_date", 500);
    const sales = await base44.entities.Sale.list("-created_date", 500);
    const purchases = await base44.entities.Purchase.list("-created_date", 500);

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
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}