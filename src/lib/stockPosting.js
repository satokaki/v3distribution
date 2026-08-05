import { base44 } from "@/api/base44Client";

/**
 * Apply a stock movement (in/out) for a product in a warehouse.
 * Updates StockBalance and appends a StockLedger entry.
 */
export async function applyStockMovement({
  product,
  branch,
  warehouse,
  type,
  direction,
  qty,
  refType,
  refId,
  refCode,
  note,
}) {
  const productId = product.product_id || product.id;
  const filters = { product_id: productId, warehouse_id: warehouse.id };
  const existing = await base44.entities.StockBalance.filter(filters);
  let balance = existing[0];
  let newQty;
  const dir = direction || (type === "in" ? "in" : "out");

  if (balance) {
    newQty = dir === "in" ? balance.quantity + qty : balance.quantity - qty;
    await base44.entities.StockBalance.update(balance.id, { quantity: newQty });
  } else {
    newQty = dir === "in" ? qty : -qty;
    balance = await base44.entities.StockBalance.create({
      product_id: productId,
      product_name: product.product_name || product.name,
      sku: product.sku,
      branch_id: branch.id,
      branch_code: branch.code,
      warehouse_id: warehouse.id,
      warehouse_name: warehouse.name,
      quantity: newQty,
      unit: product.unit || "pcs",
      min_stock: product.min_stock || 0,
    });
  }

  await base44.entities.StockLedger.create({
    product_id: productId,
    product_name: product.product_name || product.name,
    sku: product.sku,
    branch_id: branch.id,
    branch_code: branch.code,
    warehouse_id: warehouse.id,
    warehouse_name: warehouse.name,
    movement_type: type,
    ref_type: refType,
    ref_id: refId,
    ref_code: refCode,
    quantity: qty,
    balance_after: newQty,
    note: note || "",
    date: new Date().toISOString(),
  });

  return newQty;
}