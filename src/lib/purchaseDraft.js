import { base44 } from "@/api/base44Client";

async function invoke(name, payload) {
  try { const response = await base44.functions.invoke(name, payload); return response.data; }
  catch (error) { const body = error?.response?.data || {}; const safe = new Error(body.message || "Draft pembelian gagal diproses"); safe.code = body.error || "PURCHASE_DRAFT_FAILED"; throw safe; }
}

export const savePurchaseDraft = (payload) => invoke("savePurchaseDraft", payload);
export const deletePurchaseDraft = (purchaseId) => invoke("deletePurchaseDraft", { purchase_id: purchaseId });
