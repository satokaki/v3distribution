const HEADER_ALIASES = {
  product_code: ["id barang", "kode barang", "kode item", "product code", "kode produk"],
  sku: ["sku", "no sku", "nomor sku", "kode sku"],
  name: ["nama item", "nama barang", "nama produk", "produk", "item", "name", "product name"],
  category: ["jenis", "kategori", "category", "nama kategori"],
  brand: ["merk", "merek", "brand"],
  barcode: ["barcode", "kode barcode"],
  subcategory: ["subkategori", "subcategory"],
  product_type: ["jenis barang", "jenis produk", "product type"],
  unit: ["sat", "satuan", "unit"],
  content_per_carton: ["isi per karton", "content per carton"],
  nicotine_level: ["kadar nikotin", "nicotine"],
  volume: ["volume"],
  purchase_price: ["harga pokok", "hpp", "harga beli", "purchase price"],
  retail_price: ["harga retail", "harga jual", "selling price", "retail price"],
  grosir_price: ["harga grosir", "wholesale price"],
  interbranch_price: ["harga antar cabang", "interbranch price"],
  min_stock: ["minimum stok", "min stok", "min stock"],
};

const NUMERIC_FIELDS = new Set(["content_per_carton", "purchase_price", "retail_price", "grosir_price", "interbranch_price", "min_stock"]);

export function normalizeImportValue(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeImportValue(value).toLowerCase().replace(/[._/-]+/g, " ").replace(/\s+/g, " ");
}

function canonicalHeader(header) {
  const normalized = normalizeKey(header);
  return Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0] || null;
}

function parseDelimitedLine(line, delimiter) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(current);
      current = "";
    } else current += char;
  }
  values.push(current);
  return values;
}

export function parseProductImportText(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines.length) return [];
  const delimiter = ["\t", ";", ","].sort((a, b) => Math.max(...lines.map((line) => line.split(b).length)) - Math.max(...lines.map((line) => line.split(a).length)))[0];
  return parseProductImportMatrix(lines.map((line) => parseDelimitedLine(line, delimiter)));
}

export function parseProductImportMatrix(matrix) {
  const rows = Array.isArray(matrix) ? matrix : [];
  const headerIndex = rows.findIndex((row) => row.some((cell) => canonicalHeader(cell) === "name"));
  if (headerIndex < 0) {
    const result = [];
    result.importMeta = { headerRow: null, totalRows: 0 };
    return result;
  }
  const headers = rows[headerIndex].map(canonicalHeader);
  const result = rows.slice(headerIndex + 1).flatMap((values, offset) => {
    const source = Object.fromEntries(headers.map((header, index) => [header, normalizeImportValue(values[index])]).filter(([header]) => header));
    if (!Object.values(source).some(Boolean)) return [];
    return [{ ...source, __row: headerIndex + offset + 2 }];
  });
  result.importMeta = { headerRow: headerIndex + 1, totalRows: result.length };
  return result;
}

function nextSequence(records, field, prefix, pad = 6) {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
  const max = records.reduce((current, row) => {
    const match = normalizeImportValue(row[field]).match(pattern);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  let value = max;
  return () => `${prefix}-${String(++value).padStart(pad, "0")}`;
}

function duplicateNameBrandKey(name, brand) {
  return `${normalizeKey(name)}|${normalizeKey(brand)}`;
}

function skuCategoryCode(category, categoryText) {
  const value = normalizeImportValue(category?.code || categoryText || "LQD").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (value || "LQD").slice(0, 3);
}

function toNumber(value) {
  if (value === "") return undefined;
  let normalized = String(value).replace(/\s/g, "");
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "");
  else if (comma >= 0) normalized = /,\d{1,2}$/.test(normalized) ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "");
  else if (dot >= 0 && !/\.\d{1,2}$/.test(normalized)) normalized = normalized.replace(/\./g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

export function prepareProductImport(rows, existingProducts = [], categories = []) {
  const nextProductCode = nextSequence(existingProducts, "product_code", "BRG");
  const skuGenerators = new Map();
  const usedCodes = new Set(existingProducts.map((row) => normalizeKey(row.product_code)).filter(Boolean));
  const usedSkus = new Set(existingProducts.map((row) => normalizeKey(row.sku)).filter(Boolean));
  const usedNameBrands = new Set(existingProducts.map((row) => duplicateNameBrandKey(row.name, row.brand)));
  const usedBarcodes = new Set(existingProducts.map((row) => normalizeKey(row.barcode)).filter(Boolean));
  const categoryMap = new Map(categories.flatMap((category) => [category.id, category.code, category.name].filter(Boolean).map((value) => [normalizeKey(value), category])));

  return rows.map((source, index) => {
    const name = normalizeImportValue(source.name);
    const brand = normalizeImportValue(source.brand);
    const legacyCode = normalizeImportValue(source.product_code || source.sku);
    const legacyBarcode = normalizeImportValue(source.barcode);
    const nameBrandKey = duplicateNameBrandKey(name, brand);
    const categoryText = normalizeImportValue(source.category);
    const category = categoryMap.get(normalizeKey(categoryText));
    let status = "READY";
    let message = "Siap diimport";

    if (!name) { status = "INVALID"; message = "Nama Barang wajib diisi"; }
    else if (usedNameBrands.has(nameBrandKey)) { status = "DUPLICATE"; message = "Nama Barang + Merk sudah ada"; }
    else if (legacyBarcode && usedBarcodes.has(normalizeKey(legacyBarcode))) { status = "DUPLICATE"; message = "Barcode sudah digunakan"; }

    let productCode = "";
    let sku = "";
    if (status === "READY") {
      productCode = nextProductCode();
      while (usedCodes.has(normalizeKey(productCode))) productCode = nextProductCode();
      const skuPrefix = `PST-${skuCategoryCode(category, categoryText)}`;
      if (!skuGenerators.has(skuPrefix)) skuGenerators.set(skuPrefix, nextSequence(existingProducts, "sku", skuPrefix));
      const nextSku = skuGenerators.get(skuPrefix);
      sku = nextSku();
      while (usedSkus.has(normalizeKey(sku))) sku = nextSku();
    }
    const payload = { product_code: productCode, sku, name, unit: "pcs", is_active: true, sync_enabled: true };
    if (brand) payload.brand = brand;
    if (legacyBarcode) payload.barcode = legacyBarcode;
    if (categoryText) payload.category_name = category?.name || categoryText;
    if (category) payload.category_id = category.id;
    for (const [field, value] of Object.entries(source)) {
      if (!value || ["product_code", "sku", "barcode", "name", "brand", "category", "__row"].includes(field)) continue;
      const parsed = NUMERIC_FIELDS.has(field) ? toNumber(value) : value;
      if (parsed !== undefined) payload[field] = parsed;
    }

    if (status === "READY") {
      usedCodes.add(normalizeKey(productCode));
      usedSkus.add(normalizeKey(sku));
      usedNameBrands.add(nameBrandKey);
      if (legacyBarcode) usedBarcodes.add(normalizeKey(legacyBarcode));
    }
    return { row: source.__row || index + 2, name, legacy_code: legacyCode, legacy_barcode: legacyBarcode, product_code: productCode, sku, category: payload.category_name || "", brand, purchase_price: payload.purchase_price, status, message, payload };
  });
}

export function nextProductIdentifiers(existingProducts, category) {
  const skuPrefix = `PST-${skuCategoryCode(category, category?.name)}`;
  return {
    product_code: nextSequence(existingProducts, "product_code", "BRG")(),
    sku: nextSequence(existingProducts, "sku", skuPrefix)(),
  };
}
