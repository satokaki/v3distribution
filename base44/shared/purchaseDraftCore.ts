import { PostingError, resolvePurchaseBranch, safePostingError } from "./postingCore.ts";

const one = async (entity: any, query: any) => (await entity.filter(query, "created_date", 10))[0] || null;

function cleanDraftPayload(payload: any, branch: any) {
  const { purchase_id: _purchaseId, id: _id, created_date: _createdDate, updated_date: _updatedDate, created_by: _createdBy, created_by_id: _createdById, status: _status, ...business } = payload || {};
  return { ...business, branch_id: branch.id, branch_code: branch.code, status: "draft" };
}

export async function savePurchaseDraft({ payload, user, db }: any) {
  const branch = await resolvePurchaseBranch(user, payload, db);
  if (payload?.purchase_id) {
    const existing = await one(db.Purchase, { id: payload.purchase_id });
    if (!existing) throw new PostingError("PURCHASE_DRAFT_NOT_FOUND", "Draft pembelian tidak ditemukan", 404);
    if (existing.status !== "draft") throw new PostingError("ALREADY_POSTED", "Hanya draft pembelian yang dapat diubah", 409);
    if (existing.branch_id !== branch.id) throw new PostingError("PURCHASE_HEAD_OFFICE_ONLY", "Draft pembelian tidak sesuai cabang Pusat aktif", 403);
    return { purchase: await db.Purchase.update(existing.id, cleanDraftPayload(payload, branch)) };
  }
  if (!payload?.code) throw new PostingError("PURCHASE_CODE_REQUIRED", "Kode draft pembelian wajib tersedia");
  return { purchase: await db.Purchase.create(cleanDraftPayload(payload, branch)) };
}

export async function deletePurchaseDraft({ payload, user, db }: any) {
  const existing = await one(db.Purchase, { id: payload?.purchase_id });
  if (!existing) throw new PostingError("PURCHASE_DRAFT_NOT_FOUND", "Draft pembelian tidak ditemukan", 404);
  if (existing.status !== "draft") throw new PostingError("ALREADY_POSTED", "Transaksi posted tidak dapat dihapus", 409);
  await resolvePurchaseBranch(user, { branch_id: existing.branch_id }, db);
  await db.Purchase.delete(existing.id);
  return { deleted: true };
}

export const safePurchaseDraftError = safePostingError;
