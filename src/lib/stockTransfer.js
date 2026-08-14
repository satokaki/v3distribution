import { base44 } from "@/api/base44Client";

async function invoke(name, payload) {
  try { const response = await base44.functions.invoke(name, payload); return response.data; }
  catch (error) { const body = error?.response?.data || {}; const safe = new Error(body.message || "Mutasi gagal diproses"); safe.code = body.error || "INVALID_TRANSFER"; throw safe; }
}

export const saveStockTransferDraft = (payload) => invoke("saveStockTransferDraft", payload);
export const approveStockTransfer = (transferId, approvalRequestId = crypto.randomUUID()) => invoke("approveStockTransfer", { transfer_id: transferId, approval_request_id: approvalRequestId });
export const receiveStockTransfer = (payload) => invoke("receiveStockTransfer", { ...payload, receiving_request_id: payload.receiving_request_id || crypto.randomUUID() });
export const deleteStockTransferDraft = (transferId) => invoke("deleteStockTransferDraft", { transfer_id: transferId });
