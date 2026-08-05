import { base44 } from "@/api/base44Client";

function ymd(dateStr) {
  if (dateStr && dateStr.length >= 10) return dateStr.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/**
 * Generate kode transaksi harian: PREFIX-YYYYMMDD-XXXX
 * Sequence direset per hari berdasarkan jumlah record yang sudah ada di hari tsb.
 * Best-effort client-side (sama pendekatannya dengan seqCode lama).
 */
export async function generateDailyCode(entityName, prefix, dateStr) {
  const day = ymd(dateStr).replace(/-/g, "");
  const list = await base44.entities[entityName].list("-created_date", 500);
  const prefixDay = `${prefix}-${day}-`;
  const count = (list || []).filter((r) => (r.code || "").startsWith(prefixDay)).length;
  return `${prefix}-${day}-${String(count + 1).padStart(4, "0")}`;
}