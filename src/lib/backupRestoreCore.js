export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_PAGE_SIZE = 500;
export const RESTORE_BATCH_SIZE = 25;
export const BACKUP_FUNCTION_NAME = "backupRestore";

export function formatFunctionInvocationError(error, action) {
  const status = error?.response?.status ?? error?.status ?? "unknown";
  const backendMessage = error?.response?.data?.error || error?.response?.data?.message || error?.message || "Unknown error";
  const title = Number(status) === 404 ? "BACKUP FUNCTION NOT FOUND" : "BACKUP FUNCTION INVOCATION FAILED";
  return new Error(`${title}\nFunction: ${BACKUP_FUNCTION_NAME}\nAction: ${action}\nHTTP: ${status}\nDetail: ${backendMessage}`);
}

export function splitBatches(records, size = RESTORE_BATCH_SIZE) {
  if (!Number.isInteger(size) || size < 1) throw new Error("INVALID_BATCH_SIZE");
  const batches = [];
  for (let index = 0; index < records.length; index += size) batches.push(records.slice(index, index + size));
  return batches;
}

export function calculateProgress(processed, total) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((processed / total) * 100)));
}

export function resetConfirmation(mode) {
  return mode === "full" ? "RESET FULL" : "RESET TRANSAKSI";
}

export function isResetConfirmed(mode, value) {
  return value === resetConfirmation(mode);
}

export function validateBackupFile(backup, expectedMode) {
  if (!backup || backup.manifest?.backup_schema_version !== BACKUP_SCHEMA_VERSION) throw new Error("Versi file backup tidak didukung.");
  if (backup.manifest?.backup_type !== expectedMode) throw new Error("Tipe file backup tidak sesuai dengan mode restore.");
  if (!backup.entities || typeof backup.entities !== "object") throw new Error("Data entity tidak ditemukan dalam file backup.");
  return backup;
}

export function createBackupDocument({ mode, createdBy, registry, entities }) {
  const entitySummary = registry.map(({ entity }) => ({ entity, record_count: entities[entity]?.length || 0 }));
  return {
    manifest: {
      backup_id: `V3POS_${mode.toUpperCase()}_${new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replaceAll("T", "").replaceAll("Z", "").replaceAll(".", "").slice(0, 14)}`,
      backup_type: mode,
      backup_schema_version: BACKUP_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      created_by: createdBy || "unknown",
      consistency_mode: "BEST_EFFORT_LIVE_SNAPSHOT",
      entity_count: entitySummary.length,
      total_records: entitySummary.reduce((sum, row) => sum + row.record_count, 0),
      entities: entitySummary,
    },
    entities,
  };
}
