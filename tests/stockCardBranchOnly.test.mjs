import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { aggregateStockSummary, buildBranchStockReadModel, buildStockCardExport, normalizeAndDeduplicateLedger } from "../src/lib/branchStockLedgerCore.js";

const movement = (id, quantity, type, date, extra = {}) => ({ id, product_id: "P1", branch_id: "B1", quantity, movement_type: type, date, ...extra });

test("A - legacy history produces 100, 80, 70", () => {
  const rows = [movement("1", 100, "in", "2026-07-01" , { warehouse_id: "W1" }), movement("2", 20, "out", "2026-07-02", { warehouse_id: "W1" }), movement("3", 10, "out", "2026-07-03", { warehouse_id: "W1" })];
  assert.deepEqual(buildBranchStockReadModel({ ledgerRows: rows }).timelines.map((row) => row.running_balance), [100, 80, 70]);
});

test("B - legacy to branch transition has no fake opening movement", () => {
  const rows = [movement("legacy", 100, "in", "2026-07-01", { warehouse_id: "W1" }), movement("branch", 10, "out", "2026-08-01", { balance_scope: "branch" })];
  const model = buildBranchStockReadModel({ ledgerRows: rows });
  assert.deepEqual(model.timelines.map((row) => row.running_balance), [100, 90]);
  assert.equal(model.timelines.some((row) => row.transaction_type === "opening_balance"), false);
});

test("C - branch ledger only produces 20, 15", () => {
  const rows = [movement("1", 20, "purchase", "2026-08-01", { balance_scope: "branch" }), movement("2", -5, "sale", "2026-08-02", { balance_scope: "branch" })];
  assert.deepEqual(buildBranchStockReadModel({ ledgerRows: rows }).timelines.map((row) => row.running_balance), [20, 15]);
});

test("D - strong duplicates removed while valid same date and qty remain", () => {
  const duplicate = movement("2", -5, "sale", "2026-08-02", { ref_id: "SALE-1" });
  const result = normalizeAndDeduplicateLedger([movement("1", -5, "sale", "2026-08-02", { ref_id: "SALE-1" }), duplicate, movement("3", -5, "sale", "2026-08-02"), movement("4", -5, "sale", "2026-08-02")]);
  assert.equal(result.movements.length, 3);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicateCandidates.length, 1);
});

test("E - period opening 70, in 20, out 10, closing 80", () => {
  const rows = [movement("0", 70, "in", "2026-07-31"), movement("1", 20, "in", "2026-08-01"), movement("2", 10, "out", "2026-08-03")];
  const summary = buildBranchStockReadModel({ ledgerRows: rows, startDate: "2026-08-01", endDate: "2026-08-31" }).summaries[0];
  assert.deepEqual(summary, { branch_id: "B1", opening_balance: 70, total_in: 20, total_out: 10, closing_balance: 80 });
});

test("F - business transaction date wins over created date", () => {
  const rows = [movement("later", 5, "in", "2026-08-02", { created_date: "2026-08-01" }), movement("earlier", 10, "in", "2026-08-01", { created_date: "2026-08-03" })];
  assert.deepEqual(buildBranchStockReadModel({ ledgerRows: rows }).timelines.map((row) => row.id), ["earlier", "later"]);
});

test("G - stock card UI is free of storage-location controls and columns", () => {
  const page = fs.readFileSync(new URL("../src/pages/StockCard.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /warehouse|gudang/i);
});

test("H/I - branch timelines stay independent for Head Office aggregation", () => {
  const rows = [movement("b1", 10, "in", "2026-08-01"), movement("b2", 20, "in", "2026-08-01", { branch_id: "B2" }), movement("b1-out", 2, "out", "2026-08-02")];
  const model = buildBranchStockReadModel({ ledgerRows: rows });
  assert.deepEqual(model.summaries.map((row) => [row.branch_id, row.closing_balance]), [["B1", 8], ["B2", 20]]);
  assert.equal(aggregateStockSummary(model.summaries).closing_balance, 28);
});

test("J/K - legacy and branch ledgers share one timeline with source metadata", () => {
  const model = buildBranchStockReadModel({ ledgerRows: [movement("legacy", 10, "in", "2026-08-01", { warehouse_id: "W1" }), movement("branch", 2, "out", "2026-08-02", { balance_scope: "branch" })] });
  assert.deepEqual(model.timelines.map((row) => row.source_scope), ["LEGACY_WAREHOUSE", "BRANCH"]);
});

test("L - summary formula closes at 110", () => {
  assert.deepEqual(aggregateStockSummary([{ opening_balance: 100, total_in: 30, total_out: 20, closing_balance: 110 }]), { opening_balance: 100, total_in: 30, total_out: 20, closing_balance: 110 });
});

test("M - export consumes read-model rows and contains no storage-location column", () => {
  const model = buildBranchStockReadModel({ ledgerRows: [movement("1", 10, "in", "2026-08-01")] });
  const matrix = buildStockCardExport({ rows: model.timelines, summary: aggregateStockSummary(model.summaries), product: { name: "Liquid", sku: "LQ-1" }, branchLabel: "Patrang", periodLabel: "Agustus", includeBranch: false });
  assert.deepEqual(matrix.at(-2), ["Tanggal", "No Referensi", "Jenis Transaksi", "Masuk", "Keluar", "Saldo", "User", "Catatan"]);
  assert.equal(matrix.at(-1)[5], 10);
});

test("current balance diagnostic is read-only MATCH/MISMATCH data", () => {
  const match = buildBranchStockReadModel({ ledgerRows: [movement("1", 10, "in", "2026-08-01")], resolvedBalances: new Map([["B1", 10]]) });
  const mismatch = buildBranchStockReadModel({ ledgerRows: [movement("1", 10, "in", "2026-08-01")], resolvedBalances: new Map([["B1", 15]]) });
  assert.equal(match.diagnostics[0].status, "MATCH");
  assert.deepEqual(mismatch.diagnostics[0], { branch_id: "B1", historical_closing: 10, resolved_balance: 15, difference: 5, status: "MISMATCH" });
});

test("period end uses Asia/Jakarta business day", () => {
  const model = buildBranchStockReadModel({ ledgerRows: [movement("1", 10, "in", "2026-08-14T20:00:00.000Z")], startDate: "2026-08-15", endDate: "2026-08-15" });
  assert.equal(model.timelines.length, 1);
  assert.equal(model.summaries[0].closing_balance, 10);
});
