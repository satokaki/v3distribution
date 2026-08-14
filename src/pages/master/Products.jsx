import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useEntityList } from "@/lib/useEntityList";
import PageHeader from "@/components/PageHeader";
import ProductImportModal from "@/components/ProductImportModal";
import { formatCurrency } from "@/lib/utils";
import { nextProductIdentifiers } from "@/lib/productImportCore";
import {
  FileUp,
  Plus,
  Pencil,
  Trash2,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Printer,
  X,
} from "lucide-react";

const PRODUCT_READ_BATCH = 500;
const PRODUCT_READ_MAX = 100000;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];

const START_B = 104;
const STOP = 106;

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildCode128Bars(value) {
  const text = String(value ?? "").trim();
  if (!text) return { bars: [], width: 1 };

  const codes = [START_B];

  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(`Barcode mengandung karakter yang tidak didukung: ${ch}`);
    }
    codes.push(code - 32);
  }

  let checksum = START_B;
  for (let i = 1; i < codes.length; i += 1) {
    checksum += codes[i] * i;
  }
  checksum %= 103;

  codes.push(checksum, STOP);

  let x = 0;
  const bars = [];

  codes.forEach((code) => {
    const pattern = CODE128_PATTERNS[code];
    [...pattern].forEach((char, index) => {
      const width = Number(char);
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    });
  });

  return { bars, width: Math.max(x, 1) };
}

function BarcodeVisual({ value, height = 32, width = 130 }) {
  const data = useMemo(() => {
    try {
      return { ...buildCode128Bars(value), error: "" };
    } catch (error) {
      return { bars: [], width: 1, error: error.message };
    }
  }, [value]);

  if (!value) return <span className="text-muted-foreground">—</span>;
  if (data.error) return <span className="text-xs text-destructive">Invalid</span>;

  return (
    <div>
      <svg
        viewBox={`0 0 ${data.width} ${height}`}
        width={width}
        height={height}
        preserveAspectRatio="none"
        className="text-black"
      >
        {data.bars.map((bar, index) => (
          <rect
            key={index}
            x={bar.x}
            y="0"
            width={bar.width}
            height={height}
            fill="currentColor"
          />
        ))}
      </svg>
    </div>
  );
}

function printBarcode(product) {
  if (!product?.barcode) {
    alert("Barcode barang belum diisi.");
    return;
  }

  let data;
  try {
    data = buildCode128Bars(product.barcode);
  } catch (error) {
    alert(error.message);
    return;
  }

  const rects = data.bars
    .map(
      (bar) =>
        `<rect x="${bar.x}" y="0" width="${bar.width}" height="58" fill="#000"/>`
    )
    .join("");

  const safe = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const win = window.open("", "_blank", "width=520,height=420");
  if (!win) {
    alert("Popup cetak diblokir browser.");
    return;
  }

  win.document.write(`<!doctype html>
<html>
<head>
  <title>Barcode ${safe(product.name)}</title>
  <style>
    @page { margin: 5mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 10mm; }
    .label { width: 65mm; margin: auto; text-align: center; }
    svg { width: 58mm; height: 18mm; }
    .code { font: 10px monospace; margin-top: 2mm; }
    .name { font-size: 11px; font-weight: 700; line-height: 1.25; margin-top: 2mm; }\n    .price { font-size: 13px; font-weight: 800; margin-top: 1.5mm; }
  </style>
</head>
<body>
  <div class="label">
    <svg viewBox="0 0 ${data.width} 58" preserveAspectRatio="none">${rects}</svg>
    <div class="nameprice">${safe(product.name)} · ${safe(formatCurrency(product.retail_price || 0))}</div>
  </div>
  <script>window.onload = () => window.print()</script>
</body>
</html>`);

  win.document.close();
}

async function listAllProducts() {
  const rows = [];
  let skip = 0;

  while (true) {
    const page = await base44.entities.Product.list(
      "-created_date",
      PRODUCT_READ_BATCH,
      skip
    );

    rows.push(...page);

    if (page.length < PRODUCT_READ_BATCH) break;

    skip += page.length;

    if (rows.length >= PRODUCT_READ_MAX) {
      throw new Error(
        `PRODUCT_DATA_LIMIT: jumlah Product melebihi batas aman ${PRODUCT_READ_MAX} record`
      );
    }
  }

  return rows;
}

const DEFAULT_FORM = {
  product_code: "",
  sku: "",
  barcode: "",
  name: "",
  brand: "",
  category_id: "",
  subcategory: "",
  unit: "pcs",
  pack_size: 1,
  purchase_price: 0,
  retail_price: 0,
  grosir_price: 0,
  interbranch_price: 0,
  vvip_price: 0,
  min_stock: 0,
  sync_enabled: true,
  is_active: true,
};

function Field({ label, children, full = false }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted disabled:text-muted-foreground";

function ProductEditorModal({
  open,
  onClose,
  onSubmit,
  product,
  categories,
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...DEFAULT_FORM,
      ...(product || {}),
      unit: product?.unit === "pack" ? "pack" : "pcs",
      pack_size: product?.unit === "pack" ? Number(product?.pack_size || 1) : 1,
    });
  }, [open, product]);

  if (!open) return null;

  const set = (name, value) => {
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "unit" && value === "pcs" ? { pack_size: 1 } : {}),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!String(form.name || "").trim()) {
      alert("Nama Barang wajib diisi.");
      return;
    }

    if (form.unit === "pack" && Number(form.pack_size || 0) <= 0) {
      alert("Isi per Pack wajib lebih dari 0 PCS.");
      return;
    }

    setSaving(true);

    try {
      await onSubmit({
        ...form,
        name: String(form.name).trim(),
        brand: String(form.brand || "").trim(),
        barcode: String(form.barcode || "").trim(),
        pack_size: form.unit === "pack" ? Number(form.pack_size) : 1,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={submit}
        className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-bold">
              {product ? "Edit Barang" : "Tambah Barang"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Master barang terpusat V3 Distribution.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-150px)] overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="ID Barang">
              <input
                className={inputClass}
                value={form.product_code || ""}
                disabled
                placeholder="Otomatis"
              />
            </Field>

            <Field label="SKU">
              <input
                className={inputClass}
                value={form.sku || ""}
                disabled
                placeholder="Otomatis"
              />
            </Field>

            <Field label="Barcode">
              <input
                className={inputClass}
                value={form.barcode || ""}
                onChange={(e) => set("barcode", e.target.value)}
              />
            </Field>

            <Field label="Nama Barang">
              <input
                className={inputClass}
                value={form.name || ""}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </Field>

            <Field label="Merek">
              <input
                className={inputClass}
                value={form.brand || ""}
                onChange={(e) => set("brand", e.target.value)}
              />
            </Field>

            <Field label="Kategori">
              <select
                className={inputClass}
                value={form.category_id || ""}
                onChange={(e) => set("category_id", e.target.value)}
              >
                <option value="">Pilih kategori</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Subkategori">
              <input
                className={inputClass}
                value={form.subcategory || ""}
                onChange={(e) => set("subcategory", e.target.value)}
              />
            </Field>

            <Field label="Satuan">
              <select
                className={inputClass}
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
              >
                <option value="pcs">PCS</option>
                <option value="pack">PACK</option>
              </select>
            </Field>

            {form.unit === "pack" ? (
              <Field label="1 PACK Isi Berapa PCS">
                <div className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    type="number"
                    min="1"
                    step="1"
                    value={form.pack_size}
                    onChange={(e) => set("pack_size", e.target.value)}
                    required
                  />
                  <span className="whitespace-nowrap text-sm font-medium">PCS</span>
                </div>
              </Field>
            ) : null}

            <Field label="HBT">
              <input
                className={inputClass}
                type="number"
                value={form.purchase_price ?? 0}
                disabled
              />
            </Field>

            <Field label="MSRP">
              <input
                className={inputClass}
                type="number"
                min="0"
                value={form.retail_price ?? 0}
                onChange={(e) => set("retail_price", Number(e.target.value))}
              />
            </Field>

            <Field label="WHOLESALE">
              <input
                className={inputClass}
                type="number"
                min="0"
                value={form.grosir_price ?? 0}
                onChange={(e) => set("grosir_price", Number(e.target.value))}
              />
            </Field>

            <Field label="VIP">
              <input
                className={inputClass}
                type="number"
                min="0"
                value={form.interbranch_price ?? 0}
                onChange={(e) => set("interbranch_price", Number(e.target.value))}
              />
            </Field>

            <Field label="VVIP">
              <input
                className={inputClass}
                type="number"
                min="0"
                value={form.vvip_price ?? 0}
                onChange={(e) => set("vvip_price", Number(e.target.value))}
              />
            </Field>

            <Field label="Minimum Stok">
              <input
                className={inputClass}
                type="number"
                min="0"
                value={form.min_stock ?? 0}
                onChange={(e) => set("min_stock", Number(e.target.value))}
              />
            </Field>

            <Field label="Sinkron Antar Cabang">
              <label className="flex h-10 items-center gap-2 rounded-lg border px-3">
                <input
                  type="checkbox"
                  checked={Boolean(form.sync_enabled)}
                  onChange={(e) => set("sync_enabled", e.target.checked)}
                />
                <span className="text-sm">
                  {form.sync_enabled ? "Aktif" : "Nonaktif"}
                </span>
              </label>
            </Field>

            <Field label="Status Aktif">
              <label className="flex h-10 items-center gap-2 rounded-lg border px-3">
                <input
                  type="checkbox"
                  checked={Boolean(form.is_active)}
                  onChange={(e) => set("is_active", e.target.checked)}
                />
                <span className="text-sm">
                  {form.is_active ? "Aktif" : "Nonaktif"}
                </span>
              </label>
            </Field>

            <Field label="Preview Barcode" full>
              <div className="flex flex-wrap items-end gap-3">
                <div className="rounded-lg border bg-white p-3">
                  <BarcodeVisual value={form.barcode} height={58} width={240} />
                  <div className="mt-1 max-w-[300px] text-center text-[11px] font-semibold">
                    {form.name || "Nama Barang"} · {formatCurrency(form.retail_price || 0)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => printBarcode(form)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-accent"
                >
                  <Printer className="h-4 w-4" />
                  Cetak Barcode
                </button>
              </div>
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/20 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Batal
          </button>

          <button
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : product ? "Simpan Perubahan" : "Tambah Barang"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Products() {
  const { create, update, remove } = useEntityList("Product");

  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [categories, setCategories] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const reloadProducts = useCallback(async () => {
    setLoading(true);
    setErrorText("");

    try {
      setAllProducts(await listAllProducts());
    } catch (error) {
      console.error(error);
      setErrorText(error?.message || "Gagal memuat Master Barang.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadProducts();
    base44.entities.ProductCategory
      .list("-created_date", 5000, 0)
      .then(setCategories)
      .catch(console.error);
  }, [reloadProducts]);

  const brands = useMemo(
    () =>
      [...new Set(
        allProducts
          .map((product) => String(product.brand || "").trim())
          .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b, "id")),
    [allProducts]
  );

  const filteredProducts = useMemo(() => {
    const search = normalize(searchTerm);
    const categoryName = normalize(
      categories.find((category) => category.id === selectedCategory)?.name
    );

    return allProducts.filter((product) => {
      const matchesSearch =
        !search ||
        [
          product.product_code,
          product.sku,
          product.barcode,
          product.name,
          product.brand,
          product.category_name,
        ].some((value) => normalize(value).includes(search));

      const matchesBrand =
        selectedBrand === "all" ||
        normalize(product.brand) === normalize(selectedBrand);

      const matchesCategory =
        selectedCategory === "all" ||
        product.category_id === selectedCategory ||
        (categoryName && normalize(product.category_name) === categoryName);

      return matchesSearch && matchesBrand && matchesCategory;
    });
  }, [
    allProducts,
    searchTerm,
    selectedBrand,
    selectedCategory,
    categories,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / pageSize)
  );

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedBrand, selectedCategory, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  const rangeStart =
    filteredProducts.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, filteredProducts.length);

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedBrand("all");
    setSelectedCategory("all");
  };

  const handleSubmit = async (values) => {
    const category = categories.find(
      (category) => category.id === values.category_id
    );

    const payload = {
      product_code: values.product_code,
      sku: values.sku,
      barcode: values.barcode,
      name: values.name,
      brand: values.brand,
      category_id: values.category_id || "",
      category_name: category?.name || "",
      subcategory: values.subcategory || "",
      unit: values.unit === "pack" ? "pack" : "pcs",
      pack_size: values.unit === "pack" ? Number(values.pack_size || 1) : 1,
      purchase_price: Number(values.purchase_price || 0),
      retail_price: Number(values.retail_price || 0),
      grosir_price: Number(values.grosir_price || 0),
      interbranch_price: Number(values.interbranch_price || 0),
      vvip_price: Number(values.vvip_price || 0),
      min_stock: Number(values.min_stock || 0),
      sync_enabled: Boolean(values.sync_enabled),
      is_active: Boolean(values.is_active),
    };

    if (!editing) {
      Object.assign(
        payload,
        nextProductIdentifiers(allProducts, category)
      );
      await create(payload);
    } else {
      // HBT read-only pada UI, pertahankan nilai existing.
      payload.purchase_price = Number(editing.purchase_price || 0);
      await update(editing.id, payload);
    }

    setModalOpen(false);
    setEditing(null);
    await reloadProducts();
  };

  const handleDelete = async (row) => {
    if (!confirm("Hapus barang ini?")) return;
    await remove(row.id);
    await reloadProducts();
  };

  return (
    <div>
      <PageHeader
        title="Master Barang"
        subtitle="Master barang terpusat V3 Distribution"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              <FileUp className="h-4 w-4" />
              Import Barang
            </button>

            <button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Tambah Barang
            </button>
          </div>
        }
      />

      <div className="mb-4 rounded-xl border bg-white p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,1fr)_220px_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari ID barang / nama / SKU / barcode..."
              className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="h-10 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="all">Semua Merk</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-10 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="all">Semua Kategori</option>
            {categories
              .slice()
              .sort((a, b) =>
                String(a.name).localeCompare(String(b.name), "id")
              )
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>

          <button
            onClick={resetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-accent"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>
            Ditemukan{" "}
            <span className="font-semibold text-foreground">
              {filteredProducts.length}
            </span>{" "}
            dari{" "}
            <span className="font-semibold text-foreground">
              {allProducts.length}
            </span>{" "}
            barang
          </div>

          <div className="flex items-center gap-2">
            <span>Tampilkan</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 rounded-md border bg-white px-2 text-xs text-foreground"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>baris</span>
          </div>
        </div>
      </div>

      {errorText ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorText}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1260px] text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="px-4 py-4">ID Barang</th>
                <th className="px-4 py-4">SKU</th>
                <th className="px-4 py-4">Nama Barang</th>
                <th className="px-4 py-4">Merek</th>
                <th className="px-4 py-4">Kategori</th>
                <th className="px-4 py-4">Satuan</th>
                <th className="px-4 py-4">HBT</th>
                <th className="px-4 py-4">MSRP</th>
                <th className="px-4 py-4">WHOLESALE</th>
                <th className="px-4 py-4">VIP</th>
                <th className="px-4 py-4">VVIP</th>
                <th className="px-4 py-4">Barcode</th>
                <th className="px-4 py-4">Status</th>
                <th className="w-[130px] px-4 py-4"></th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={14}
                    className="px-5 py-14 text-center text-muted-foreground"
                  >
                    Memuat seluruh master barang...
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={14}
                    className="px-5 py-14 text-center text-muted-foreground"
                  >
                    Tidak ada barang yang sesuai filter.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b align-top last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-4 font-mono text-xs">
                      {row.product_code || "—"}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs font-semibold">
                      {row.sku || "—"}
                    </td>
                    <td className="min-w-[220px] px-4 py-4">
                      {row.name || "—"}
                    </td>
                    <td className="px-4 py-4">{row.brand || "—"}</td>
                    <td className="px-4 py-4">
                      {row.category_name || "—"}
                    </td>
                    <td className="px-4 py-4 uppercase">
                      {row.unit === "pack"
                        ? `PACK (${row.pack_size || 1} PCS)`
                        : "PCS"}
                    </td>
                    <td className="px-4 py-4 font-medium">
                      {formatCurrency(row.purchase_price)}
                    </td>
                    <td className="px-4 py-4 font-medium">
                      {formatCurrency(row.retail_price)}
                    </td>
                    <td className="px-4 py-4 font-medium">
                      {formatCurrency(row.grosir_price)}
                    </td>
                    <td className="px-4 py-4 font-medium">
                      {formatCurrency(row.interbranch_price)}
                    </td>
                    <td className="px-4 py-4 font-medium">
                      {formatCurrency(row.vvip_price)}
                    </td>
                    <td className="px-4 py-4">
                      <BarcodeVisual value={row.barcode} />
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          row.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {row.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => printBarcode(row)}
                          className="rounded-lg p-1.5 hover:bg-accent"
                          title="Cetak Barcode"
                        >
                          <Printer className="h-4 w-4 text-emerald-700" />
                        </button>

                        <button
                          onClick={() => {
                            setEditing(row);
                            setModalOpen(true);
                          }}
                          className="rounded-lg p-1.5 hover:bg-accent"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </button>

                        <button
                          onClick={() => handleDelete(row)}
                          className="rounded-lg p-1.5 hover:bg-accent"
                          title="Hapus"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Menampilkan {rangeStart}–{rangeEnd} dari{" "}
            {filteredProducts.length}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                setPage((current) => Math.max(1, current - 1))
              }
              disabled={page <= 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="min-w-[80px] text-center text-sm">
              {page} / {totalPages}
            </span>

            <button
              onClick={() =>
                setPage((current) =>
                  Math.min(totalPages, current + 1)
                )
              }
              disabled={page >= totalPages}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <ProductEditorModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        product={editing}
        categories={categories}
      />

      <ProductImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        products={allProducts}
        categories={categories}
        onCommit={async (records) => {
          for (let index = 0; index < records.length; index += 100) {
            await base44.entities.Product.bulkCreate(
              records.slice(index, index + 100)
            );
          }
          await reloadProducts();
        }}
      />
    </div>
  );
}
