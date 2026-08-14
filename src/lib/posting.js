import { base44 } from "@/api/base44Client";

const requestId = (payload, prefix) => {
  if (payload.posting_request_id) return payload.posting_request_id;
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  payload.posting_request_id = `${prefix}-${id}`;
  return payload.posting_request_id;
};

async function invokePosting(functionName, payload, prefix) {
  requestId(payload, prefix);
  try {
    const response = await base44.functions.invoke(functionName, payload);
    return response.data.transaction;
  } catch (error) {
    const body = error.response?.data;
    const safe = new Error(body?.message || "Posting gagal diproses");
    safe.code = body?.error || "POSTING_FAILED";
    throw safe;
  }
}

/** Backward-compatible adapter. Official sale posting runs server-side. */
export async function postSale(payload) {
  return invokePosting("postSaleBackend", payload, "SALE");
}

/** Backward-compatible adapter. Official purchase posting runs server-side. */
export async function postPurchase(payload) {
  return invokePosting("postPurchaseBackend", payload, "PURCHASE");
}
