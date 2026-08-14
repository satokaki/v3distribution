import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/pages/SalesPOSNew.jsx", import.meta.url), "utf8");
const schema = JSON.parse(await readFile(new URL("../base44/entities/Sale.jsonc", import.meta.url), "utf8"));

test("A - Penjualan Baru has no warehouse dependency or selector", () => {
  assert.doesNotMatch(page, /warehouse|gudang/i);
  assert.doesNotMatch(page, /Pilih Cabang|Semua Cabang/i);
});

test("F - draft path persists Sale directly and does not call posting", () => {
  const draftBlock = page.slice(page.indexOf("const saveDraft"), page.indexOf("const post ="));
  assert.match(draftBlock, /entities\.Sale\.(create|update)/);
  assert.doesNotMatch(draftBlock, /postSale\(/);
});

test("G - legacy warehouse field remains readable but is optional and ignored by new page", () => {
  assert.ok(schema.properties.warehouse_id);
  assert.equal(schema.required.includes("warehouse_id"), false);
  assert.doesNotMatch(page, /draft\.warehouse_id|warehouse_id/);
});

test("Penjualan Baru uses branch compatibility balance and backend adapter", () => {
  assert.match(page, /getBranchProductBalance/);
  assert.match(page, /postSale\(payload\(\)\)/);
});
