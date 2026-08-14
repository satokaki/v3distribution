import assert from "node:assert/strict";
import test from "node:test";
import { parseProductImportText, prepareProductImport } from "../src/lib/productImportCore.js";

const categories = [{ id: "cat-liquid", code: "LQD", name: "Liquid" }];

test("nama barang saja valid dan ID/SKU dibuat sebelum preview", () => {
  const rows = parseProductImportText("Nama Barang\nIZZI Taro");
  const [preview] = prepareProductImport(rows, [], categories);
  assert.equal(preview.status, "READY");
  assert.equal(preview.name, "IZZI Taro");
  assert.equal(preview.product_code, "BRG-000001");
  assert.equal(preview.sku, "PST-LQD-000001");
  assert.equal(preview.payload.id, undefined);
});

test("kategori dan merk opsional dipetakan jika tersedia", () => {
  const rows = parseProductImportText("Nama Barang\tKategori\tMerk\nIZZI Taro\tLiquid\tIZZI");
  const [preview] = prepareProductImport(rows, [], categories);
  assert.equal(preview.status, "READY");
  assert.equal(preview.payload.category_id, "cat-liquid");
  assert.equal(preview.payload.category_name, "Liquid");
  assert.equal(preview.payload.brand, "IZZI");
});

test("SKU dan business ID dari file dipertahankan tanpa mengisi primary id", () => {
  const rows = parseProductImportText("ID Barang,SKU,Nama Barang\nCUSTOM-01,CUSTOM-SKU,Barang Custom");
  const [preview] = prepareProductImport(rows, [], []);
  assert.equal(preview.product_code, "CUSTOM-01");
  assert.equal(preview.sku, "CUSTOM-SKU");
  assert.equal(preview.payload.id, undefined);
});

test("SKU kosong memakai duplicate Nama Barang + Merk sebelum generate", () => {
  const rows = parseProductImportText("Nama Barang,Merk\nIZZI Taro,IZZI");
  const [preview] = prepareProductImport(rows, [{ id: "internal", name: "IZZI Taro", brand: "IZZI", sku: "OLD-SKU" }], []);
  assert.equal(preview.status, "DUPLICATE");
  assert.match(preview.message, /Nama Barang \+ Merk/);
});

test("SKU file yang sudah ada ditolak berdasarkan SKU", () => {
  const rows = parseProductImportText("Nama Barang,SKU\nProduk Baru,SKU-EXISTING");
  const [preview] = prepareProductImport(rows, [{ name: "Lain", sku: "SKU-EXISTING" }], []);
  assert.equal(preview.status, "DUPLICATE");
  assert.match(preview.message, /SKU/);
});

test("row tanpa nama invalid tetapi row lain tetap ready", () => {
  const rows = parseProductImportText("Nama Barang,Merk\n,IZZI\nValid,V3");
  const preview = prepareProductImport(rows, [], []);
  assert.equal(preview[0].status, "INVALID");
  assert.equal(preview[1].status, "READY");
});
