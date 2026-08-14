import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_SCHEMA_VERSION,
  calculateProgress,
  createBackupDocument,
  formatFunctionInvocationError,
  isResetConfirmed,
  resetConfirmation,
  splitBatches,
  validateBackupFile,
} from "../src/lib/backupRestoreCore.js";
import { BACKUP_ENTITY_REGISTRY, EXCLUDED_ENTITIES, entitiesForMode, entitiesForReset } from "../base44/shared/backupRegistry.ts";

test("restore 125 record dibagi menjadi batch 25", () => {
  const records = Array.from({ length: 125 }, (_, id) => ({ id }));
  assert.deepEqual(splitBatches(records).map((batch) => batch.length), [25, 25, 25, 25, 25]);
});

test("batch terakhir menyimpan sisa record", () => {
  const records = Array.from({ length: 53 }, (_, id) => ({ id }));
  assert.deepEqual(splitBatches(records).map((batch) => batch.length), [25, 25, 3]);
});

test("progress dihitung dinamis dan dibatasi 0-100", () => {
  assert.equal(calculateProgress(0, 100), 0);
  assert.equal(calculateProgress(37, 100), 37);
  assert.equal(calculateProgress(100, 100), 100);
  assert.equal(calculateProgress(120, 100), 100);
});

test("manifest menghitung entity dan record", () => {
  const backup = createBackupDocument({
    mode: "operational",
    createdBy: "admin@example.com",
    registry: [{ entity: "Sale" }, { entity: "StockLedger" }],
    entities: { Sale: [{ id: "sale-1" }], StockLedger: [{ id: "ledger-1" }, { id: "ledger-2" }] },
  });
  assert.equal(backup.manifest.backup_schema_version, BACKUP_SCHEMA_VERSION);
  assert.equal(backup.manifest.entity_count, 2);
  assert.equal(backup.manifest.total_records, 3);
  assert.equal(backup.manifest.consistency_mode, "BEST_EFFORT_LIVE_SNAPSHOT");
});

test("restore menolak file dengan mode berbeda", () => {
  const backup = { manifest: { backup_schema_version: BACKUP_SCHEMA_VERSION, backup_type: "full" }, entities: {} };
  assert.throws(() => validateBackupFile(backup, "operational"), /Tipe file backup/);
});

test("restore menerima file dengan schema dan mode sesuai", () => {
  const backup = { manifest: { backup_schema_version: BACKUP_SCHEMA_VERSION, backup_type: "full" }, entities: { Product: [] } };
  assert.equal(validateBackupFile(backup, "full"), backup);
});

test("registry mengklasifikasikan semua entity aplikasi kecuali User", () => {
  assert.equal(Object.keys(BACKUP_ENTITY_REGISTRY).length, 23);
  assert.equal(Object.keys(EXCLUDED_ENTITIES).length, 1);
  assert.equal(EXCLUDED_ENTITIES.User.includes("authentication"), true);
  assert.equal(entitiesForMode("full").length, 23);
  assert.equal(entitiesForMode("operational").some((row) => row.entity === "Sale"), true);
  assert.equal(entitiesForMode("operational").some((row) => row.entity === "Product"), false);
});

test("reset membutuhkan frasa konfirmasi yang persis", () => {
  assert.equal(resetConfirmation("operational"), "RESET TRANSAKSI");
  assert.equal(resetConfirmation("full"), "RESET FULL");
  assert.equal(isResetConfirmed("full", "RESET FULL"), true);
  assert.equal(isResetConfirmed("full", "reset full"), false);
});

test("reset memakai urutan dependency terbalik", () => {
  const restore = entitiesForMode("full").map((row) => row.entity);
  const reset = entitiesForReset("full").map((row) => row.entity);
  assert.deepEqual(reset, [...restore].reverse());
  assert.equal(reset.includes("User"), false);
  assert.equal(reset[0], "AuditLog");
  assert.equal(reset.at(-1), "Branch");
});

test("diagnostic 404 menyebut function, action, dan HTTP", () => {
  const error = formatFunctionInvocationError({ response: { status: 404, data: { error: "Not found" } } }, "backup_full");
  assert.match(error.message, /BACKUP FUNCTION NOT FOUND/);
  assert.match(error.message, /Function: backupRestore/);
  assert.match(error.message, /Action: backup_full/);
  assert.match(error.message, /HTTP: 404/);
});
