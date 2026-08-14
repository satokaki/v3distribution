import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseProductImportMatrix, parseProductImportText, prepareProductImport } from "../src/lib/productImportCore.js";

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

test("SKU dan kode legacy file diabaikan sebagai identifier resmi", () => {
  const rows = parseProductImportText("ID Barang,SKU,Nama Barang,Kategori\nCUSTOM-01,CUSTOM-SKU,Barang Custom,ACC");
  const [preview] = prepareProductImport(rows, [], []);
  assert.equal(preview.legacy_code, "CUSTOM-01");
  assert.equal(preview.product_code, "BRG-000001");
  assert.equal(preview.sku, "PST-ACC-000001");
  assert.equal(preview.payload.product_code, "BRG-000001");
  assert.equal(preview.payload.id, undefined);
});

test("SKU kosong memakai duplicate Nama Barang + Merk sebelum generate", () => {
  const rows = parseProductImportText("Nama Barang,Merk\nIZZI Taro,IZZI");
  const [preview] = prepareProductImport(rows, [{ id: "internal", name: "IZZI Taro", brand: "IZZI", sku: "OLD-SKU" }], []);
  assert.equal(preview.status, "DUPLICATE");
  assert.match(preview.message, /Nama Barang \+ Merk/);
});

test("SKU legacy yang sama tidak menjadi duplicate dan SKU resmi tetap digenerate", () => {
  const rows = parseProductImportText("Nama Barang,SKU\nProduk Baru,SKU-EXISTING");
  const [preview] = prepareProductImport(rows, [{ name: "Lain", sku: "SKU-EXISTING" }], []);
  assert.equal(preview.status, "READY");
  assert.equal(preview.sku, "PST-LQD-000001");
  assert.notEqual(preview.payload.sku, "SKU-EXISTING");
});

test("row tanpa nama invalid tetapi row lain tetap ready", () => {
  const rows = parseProductImportText("Nama Barang,Merk\n,IZZI\nValid,V3");
  const preview = prepareProductImport(rows, [], []);
  assert.equal(preview[0].status, "INVALID");
  assert.equal(preview[1].status, "READY");
});

test("XLSX normal membaca formatted Nama Item dan identifier", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["Kode Item", "Nama Item"], [10004, "ACC. KARET 40MM"]]);
  sheet.A2.z = "000000";
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Barang");
  const reopened = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  const matrix = XLSX.utils.sheet_to_json(reopened.Sheets.Barang, { header: 1, raw: false, defval: "" });
  const [preview] = prepareProductImport(parseProductImportMatrix(matrix), [], []);
  assert.equal(preview.name, "ACC. KARET 40MM");
  assert.equal(preview.legacy_code, "010004");
  assert.equal(preview.product_code, "BRG-000001");
});

test("generator SKU centralized memakai kategori dan sequence existing", () => {
  const rows = parseProductImportText("Kode Item,No SKU,Barcode,Nama Item,Jenis\n010004,LEGACY-SKU,010004,ACC. WRAP BATRAI 18650MAH,ACC");
  const existing = [{ name: "Produk Lama", sku: "PST-ACC-000124", barcode: "999" }];
  const [preview] = prepareProductImport(rows, existing, []);
  assert.equal(preview.status, "READY");
  assert.equal(preview.legacy_code, "010004");
  assert.equal(preview.legacy_barcode, "010004");
  assert.equal(preview.sku, "PST-ACC-000125");
  assert.equal(preview.payload.barcode, "010004");
  assert.equal(preview.payload.sku, "PST-ACC-000125");
  assert.equal(preview.payload.id, undefined);
});

test("duplicate diprioritaskan Nama + Merk lalu barcode", () => {
  const existing = [{ name: "Sama", brand: "V3", sku: "PST-ACC-000001", barcode: "111" }];
  const [sameName] = prepareProductImport(parseProductImportText("Nama Barang,Merk,Barcode\nSama,V3,222"), existing, []);
  assert.equal(sameName.status, "DUPLICATE");
  assert.match(sameName.message, /Nama Barang \+ Merk/);
  assert.equal(sameName.sku, "");

  const [sameBarcode] = prepareProductImport(parseProductImportText("Nama Barang,Merk,Barcode\nBerbeda,V3,111"), existing, []);
  assert.equal(sameBarcode.status, "DUPLICATE");
  assert.match(sameBarcode.message, /Barcode/);
  assert.equal(sameBarcode.sku, "");
});

test("header setelah judul dan informasi toko terdeteksi beserta nomor baris", () => {
  const rows = parseProductImportMatrix([
    ["Laporan Daftar Item"], ["Octo Vape"], ["KH SHIDIQ 109 JEMBER"], [],
    ["No.", "Kode Item", "Nama Item", "Jenis", "Harga Pokok", "Stok"],
    [1, "010004", "ACC. WRAP BATRAI 18650MAH", "ACC", "1,750.00", 99],
  ]);
  const [preview] = prepareProductImport(rows, [], []);
  assert.equal(rows.importMeta.headerRow, 5);
  assert.equal(rows.importMeta.totalRows, 1);
  assert.equal(preview.row, 6);
  assert.equal(preview.payload.name, "ACC. WRAP BATRAI 18650MAH");
  assert.equal(preview.payload.category_name, "ACC");
  assert.equal(preview.payload.purchase_price, 1750);
  assert.equal(preview.payload.stok, undefined);
});

test("row kategori tanpa Nama Item dilewati, bukan dibuat sebagai Product", () => {
  const rows = parseProductImportMatrix([
    ["No.", "Kode Item", "Nama Item", "Jenis"],
    ["ACC", "", "", ""],
    [1, "", "ACC. KARET 20MM", "ACC"],
  ]);
  const preview = prepareProductImport(rows, [], []);
  assert.equal(preview.length, 1);
  assert.equal(preview[0].status, "READY");
});

test("Nama saja READY dan ID/SKU kosong digenerate tanpa membuat data stok", () => {
  const rows = parseProductImportMatrix([["Nama Item", "Stok"], ["BAT. VRK 2500MAH", 50]]);
  const [preview] = prepareProductImport(rows, [], []);
  assert.equal(preview.status, "READY");
  assert.equal(preview.product_code, "BRG-000001");
  assert.equal(preview.sku, "PST-LQD-000001");
  assert.equal("StockBalance" in preview.payload, false);
  assert.equal("stock" in preview.payload, false);
});

test("CSV TSV dan TXT tetap mendeteksi header yang bukan baris pertama", () => {
  for (const text of [
    "Judul\nNama Item,Kategori\nProduk CSV,Liquid",
    "Judul\nNama Item\tJenis\nProduk TSV\tDevice",
    "Judul\nNama Item;Jenis\nProduk TXT;Aksesoris",
  ]) {
    const rows = parseProductImportText(text);
    assert.equal(rows.importMeta.headerRow, 2);
    assert.equal(prepareProductImport(rows, [], [])[0].status, "READY");
  }
});

test("sel Item pada informasi laporan tidak mengalahkan header tabel lengkap", () => {
  const rows = parseProductImportMatrix([
    ["", "Laporan Daftar Item", "", "", "Item", "-"],
    ["", "Octo Vape", "", "", "Jenis", "-"],
    ["", "KH SHIDIQ 109 JEMBER", "", "", "Supel", ""],
    ["", "IG: @octovaporbeast", "", "", "UserLogin", "JERRY"],
    [], [],
    ["No.", "Kode Item", "Barcode", "Nama Item", "Jenis", "Stok", "Sat.", "Komisi", "Harga Pokok", "Harga Jual"],
    ["ACC", "", "", "", "", "", "", "", "", ""],
    [1, "010004", "010004", "ACC. WRAP BATRAI 18650MAH", "ACC", 151, "PCS", 0, 0, 0],
  ]);
  const preview = prepareProductImport(rows, [], []);
  assert.equal(rows.importMeta.headerRow, 7);
  assert.equal(rows.importMeta.totalRows, 1);
  assert.equal(preview.length, 1);
  assert.equal(preview[0].name, "ACC. WRAP BATRAI 18650MAH");
  assert.equal(preview[0].legacy_code, "010004");
  assert.equal(preview[0].legacy_barcode, "010004");
  assert.equal(preview[0].sku, "PST-ACC-000001");
});

test("template standar satu kolom Nama Barang tetap terdeteksi", () => {
  const rows = parseProductImportMatrix([["Nama Barang"], ["Produk Template"]]);
  assert.equal(rows.importMeta.headerRow, 1);
  assert.equal(prepareProductImport(rows, [], [])[0].status, "READY");
});
