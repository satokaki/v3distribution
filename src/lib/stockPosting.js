import { base44 } from "@/api/base44Client";
import { BRANCH_SCOPE, ensureBranchProductBalance, withBranchStockLock } from "@/lib/branchStockBalance";

/**
 * Apply a stock movement (in/out) to a branch-level product balance.
 * `warehouse` remains accepted only for backward-compatible callers.
 * Updates StockBalance and appends a StockLedger entry.
 * Throws if an "out" movement would drive the balance below zero.
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
  const dir = direction || (type === "in" ? "in" : "out");

  return withBranchStockLock(branch.id, productId, async () => {
    const balance = await ensureBranchProductBalance({ branch, product });
    const currentQty = Number(balance.quantity || 0);
    const movementQty = Number(qty || 0);
    const newQty = dir === "in" ? currentQty + movementQty : currentQty - movementQty;

    if (dir === "out" && newQty < 0) {
      throw new Error(`Stok tidak cukup untuk ${product.product_name || product.sku || productId} (tersedia ${currentQty}, butuh ${movementQty})`);
    }

    await base44.entities.StockBalance.update(balance.id, { quantity: newQty, balance_scope: BRANCH_SCOPE, warehouse_id: null, warehouse_name: "" });
    await base44.entities.StockLedger.create({
      product_id: productId,
      product_name: product.product_name || product.name,
      sku: product.sku,
      branch_id: branch.id,
      branch_code: branch.code,
      balance_scope: BRANCH_SCOPE,
      warehouse_id: null,
      warehouse_name: "",
      movement_type: type,
      ref_type: refType,
      ref_id: refId,
      ref_code: refCode,
      quantity: movementQty,
      balance_after: newQty,
      note: note || "",
      date: new Date().toISOString(),
    });
    return newQty;
  });
}
