const HEADER_ALIASES = {
  product_code: ["id barang", "kode barang", "product code", "kode produk"],
  sku: ["sku", "no sku", "nomor sku", "kode sku"],
  name: ["nama barang", "nama produk", "name", "product name"],
  category: ["kategori", "category", "nama kategori"],
  brand: ["merk", "merek", "brand"],
  barcode: ["barcode", "kode barcode"],
  subcategory: ["subkategori", "subcategory"],
  product_type: ["jenis barang", "jenis produk", "product type"],
  unit: ["satuan", "unit"],
  content_per_carton: ["isi per karton", "content per carton"],
  nicotine_level: ["kadar nikotin", "nicotine"],
  volume: ["volume"],
  purchase_price: ["harga beli", "purchase price"],
  retail_price: ["harga retail", "harga jual", "retail price"],
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

function detectDelimiter(line) {
  const candidates = ["\t", ";", ","];
  return candidates.sort((a, b) => line.split(b).length - line.split(a).length)[0];
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
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter).map(canonicalHeader);
  return lines.slice(1).map((line) => {
    const values = parseDelimitedLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, normalizeImportValue(values[index])]).filter(([header]) => header));
  });
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

function toNumber(value) {
  if (value === "") return undefined;
  const normalized = String(value).replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

export function prepareProductImport(rows, existingProducts = [], categories = []) {
  const nextProductCode = nextSequence(existingProducts, "product_code", "BRG");
  const nextSku = nextSequence(existingProducts, "sku", "PST-LQD");
  const usedCodes = new Set(existingProducts.map((row) => normalizeKey(row.product_code)).filter(Boolean));
  const usedSkus = new Set(existingProducts.map((row) => normalizeKey(row.sku)).filter(Boolean));
  const usedNameBrands = new Set(existingProducts.map((row) => duplicateNameBrandKey(row.name, row.brand)));
  const categoryMap = new Map(categories.flatMap((category) => [category.id, category.code, category.name].filter(Boolean).map((value) => [normalizeKey(value), category])));

  return rows.map((source, index) => {
    const name = normalizeImportValue(source.name);
    const brand = normalizeImportValue(source.brand);
    const suppliedSku = normalizeImportValue(source.sku);
    const suppliedCode = normalizeImportValue(source.product_code);
    const nameBrandKey = duplicateNameBrandKey(name, brand);
    let status = "READY";
    let message = "Siap diimport";

    if (!name) { status = "INVALID"; message = "Nama Barang wajib diisi"; }
    else if (suppliedSku && usedSkus.has(normalizeKey(suppliedSku))) { status = "DUPLICATE"; message = "SKU sudah digunakan"; }
    else if (!suppliedSku && usedNameBrands.has(nameBrandKey)) { status = "DUPLICATE"; message = "Nama Barang + Merk sudah ada"; }
    else if (suppliedCode && usedCodes.has(normalizeKey(suppliedCode))) { status = "DUPLICATE"; message = "ID Barang sudah digunakan"; }

    let productCode = suppliedCode;
    let sku = suppliedSku;
    if (status === "READY") {
      productCode ||= nextProductCode();
      while (usedCodes.has(normalizeKey(productCode))) productCode = nextProductCode();
      sku ||= nextSku();
      while (usedSkus.has(normalizeKey(sku))) sku = nextSku();
    }
    const categoryText = normalizeImportValue(source.category);
    const category = categoryMap.get(normalizeKey(categoryText));
    const payload = { product_code: productCode, sku, name, unit: "pcs", is_active: true, sync_enabled: true };
    if (brand) payload.brand = brand;
    if (categoryText) payload.category_name = category?.name || categoryText;
    if (category) payload.category_id = category.id;
    for (const [field, value] of Object.entries(source)) {
      if (!value || ["product_code", "sku", "name", "brand", "category"].includes(field)) continue;
      const parsed = NUMERIC_FIELDS.has(field) ? toNumber(value) : value;
      if (parsed !== undefined) payload[field] = parsed;
    }

    if (status === "READY") {
      usedCodes.add(normalizeKey(productCode));
      usedSkus.add(normalizeKey(sku));
      usedNameBrands.add(nameBrandKey);
    }
    return { row: index + 2, name, product_code: productCode, sku, category: payload.category_name || "", brand, status, message, payload };
  });
}

export function nextProductIdentifiers(existingProducts) {
  return {
    product_code: nextSequence(existingProducts, "product_code", "BRG")(),
    sku: nextSequence(existingProducts, "sku", "PST-LQD")(),
  };
}
