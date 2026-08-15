import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/pages/PurchasePOSNew.jsx", import.meta.url), "utf8");
const schema = JSON.parse(await readFile(new URL("../base44/entities/Purchase.jsonc", import.meta.url), "utf8"));

test("A - Pembelian Baru has no warehouse dependency or branch selector", () => {
  assert.doesNotMatch(page, /warehouse|gudang/i);
  assert.doesNotMatch(page, /<BranchSelector|branch_id[^\n]*<select|Semua Cabang/i);
});

test("F - purchase draft persists directly without backend posting", () => {
  const draftBlock = page.slice(page.indexOf("const saveDraft"), page.indexOf("const post ="));
  assert.match(draftBlock, /savePurchaseDraft\(/);
  assert.doesNotMatch(draftBlock, /entities\.Purchase\.(create|update)/);
  assert.doesNotMatch(draftBlock, /postPurchase\(/);
});

test("G and J - legacy warehouse remains readable but optional and ignored", () => {
  assert.ok(schema.properties.warehouse_id);
  assert.ok(schema.properties.warehouse_name);
  assert.equal(schema.required.includes("warehouse_id"), false);
  assert.doesNotMatch(page, /draft\.warehouse_id|warehouse_id|warehouse_name/);
});

test("Pembelian Baru keeps dedicated form and backend adapter", () => {
  assert.match(page, /PEMBELIAN BARU/);
  assert.match(page, /postPurchase\(payload\(\)\)/);
  assert.match(page, /Laporan Pembelian/);
});

test("frontend blocks supplier purchase when operational branch is retail", () => {
  assert.match(page, /branch_type === "pusat"/);
  assert.match(page, /Pembelian supplier hanya dapat dilakukan dari Pusat/);
  assert.match(page, /Pilih Cabang Pusat di Branch Selector/);
});
