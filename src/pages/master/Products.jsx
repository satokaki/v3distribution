import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useEntityList } from "@/lib/useEntityList";
import PageHeader from "@/components/PageHeader";
import EntityFormModal from "@/components/EntityFormModal";
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
} from "lucide-react";

const PRODUCT_READ_BATCH = 500;
const PRODUCT_READ_MAX = 100000;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

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

const makeFields = (categories, unitValue = "pcs") => {
  const fields = [
    {
      name: "product_code",
      label: "ID Barang",
      type: "text",
      disabled: true,
      placeholder: "Otomatis",
    },
    {
      name: "sku",
      label: "SKU",
      type: "text",
      required: true,
      disabled: true,
      placeholder: "Otomatis",
    },
    {
      name: "barcode",
      label: "Barcode",
      type: "text",
    },
    {
      name: "name",
      label: "Nama Barang",
      type: "text",
      required: true,
      full: true,
    },
    {
      name: "brand",
      label: "Merek",
      type: "text",
    },
    {
      name: "category_id",
      label: "Kategori",
      type: "select",
      options: categories.map((c) => ({
        value: c.id,
        label: c.name,
      })),
    },
    {
      name: "subcategory",
      label: "Subkategori",
      type: "text",
    },
    {
      name: "unit",
      label: "Satuan",
      type: "select",
      options: [
        { value: "pcs", label: "PCS" },
        { value: "pack", label: "PACK" },
      ],
      default: "pcs",
    },
  ];

  if (unitValue === "pack") {
    fields.push({
      name: "pack_size",
      label: "1 Pack Isi Berapa PCS",
      type: "number",
      required: true,
      placeholder: "Contoh: 10",
    });
  }

  fields.push(
    {
      name: "purchase_price",
      label: "HBT",
      type: "number",
      disabled: true,
      placeholder: "Dihitung otomatis dari pembelian rata-rata",
    },
    {
      name: "retail_price",
      label: "MSRP",
      type: "number",
    },
    {
      name: "grosir_price",
      label: "WHOLESALE",
      type: "number",
    },
    {
      name: "interbranch_price",
      label: "VIP",
      type: "number",
    },
    {
      name: "vvip_price",
      label: "VVIP",
      type: "number",
    },
    {
      name: "min_stock",
      label: "Minimum Stok",
      type: "number",
    },
    {
      name: "sync_enabled",
      label: "Sinkron Antar Cabang",
      type: "boolean",
    },
    {
      name: "is_active",
      label: "Status Aktif",
      type: "boolean",
    }
  );

  return fields;
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function barcodePattern(value) {
  const chars = String(value || "")
    .trim()
    .split("");

  if (!chars.length) return [];

  // Visual barcode deterministic tanpa dependency library tambahan.
  // Untuk scanner-grade barcode sebaiknya diganti dengan JsBarcode/Code128 helper existing.
  const pattern = [2, 1, 2, 1];

  chars.forEach((char, index) => {
    const code = char.charCodeAt(0);
    pattern.push(
      1 + ((code + index) % 3),
      1 + ((code >> 1) % 2),
      1 + ((code >> 2) % 3),
      1 + ((code >> 3) % 2)
    );
  });

  pattern.push(2, 1, 2, 1);
  return pattern;
}

function BarcodeVisual({ value, name, compact = false }) {
  if (!value) return <span className="text-muted-foreground">—</span>;

  const pattern = barcodePattern(value);
  let x = 0;
  const bars = [];

  pattern.forEach((width, index) => {
    if (index % 2 === 0) {
      bars.push(
        <rect
          key={index}
          x={x}
          y="0"
          width={width}
          height={compact ? 30 : 42}
          fill="currentColor"
        />
      );
    }
    x += width;
  });

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <svg
        viewBox={`0 0 ${Math.max(x, 1)} ${compact ? 30 : 42}`}
        width={compact ? 120 : 170}
        height={compact ? 30 : 42}
        preserveAspectRatio="none"
        aria-label={`Barcode ${value}`}
        className="text-black"
      >
        {bars}
      </svg>
      <span className="font-mono text-[10px]">{value}</span>
      {!compact && name ? (
        <span className="max-w-[180px] text-[10px] font-semibold leading-tight">
          {name}
        </span>
      ) : null}
    </div>
  );
}

function printBarcode(product) {
  const value = String(product?.barcode || "").trim();

  if (!value) {
    alert("Barcode barang belum diisi.");
    return;
  }

  const pattern = barcodePattern(value);
  let x = 0;
  const bars = pattern
    .map((width, index) => {
      const currentX = x;
      x += width;
      return index % 2 === 0
        ? `<rect x="${currentX}" y="0" width="${width}" height="55" fill="#000"/>`
        : "";
    })
    .join("");

  const win = window.open("", "_blank", "width=520,height=420");

  if (!win) {
    alert("Popup cetak diblokir browser.");
    return;
  }

  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Barcode ${escapeHtml(product.name)}</title>
        <style>
          @page { margin: 8mm; }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 16px;
          }
          .label {
            width: 70mm;
            text-align: center;
            border: 1px dashed #bbb;
            padding: 8mm 5mm;
            margin: 0 auto;
          }
          svg { width: 58mm; height: 18mm; }
          .code {
            font-family: monospace;
            font-size: 11px;
            margin-top: 4px;
          }
          .name {
            margin-top: 6px;
            font-size: 12px;
            line-height: 1.25;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <div class="label">
          <svg viewBox="0 0 ${Math.max(x, 1)} 55" preserveAspectRatio="none">
            ${bars}
          </svg>
          <div class="code">${escapeHtml(value)}</div>
          <div class="name">${escapeHtml(product.name)}</div>
        </div>
        <script>
          window.onload = () => {
            window.print();
          };
        </script>
      </body>
    </html>
  `);

  win.document.close();
}

export default function Products() {
  const { create, update, remove } = useEntityList("Product");

  const [allProducts, setAllProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");

  const [categories, setCategories] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [formUnit, setFormUnit] = useState("pcs");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const reloadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError("");

    try {
      setAllProducts(await listAllProducts());
    } catch (error) {
      console.error("Gagal memuat seluruh Product:", error);
      setProductsError(error?.message || "Gagal memuat master barang.");
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadProducts();
    base44.entities.ProductCategory
      .list("-created_date", 5000, 0)
      .then(setCategories);
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
    const selectedCategoryName = normalize(
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
        (
          selectedCategoryName &&
          normalize(product.category_name) === selectedCategoryName
        );

      return matchesSearch && matchesBrand && matchesCategory;
    });
  }, [
    allProducts,
    searchTerm,
    selectedBrand,
    selectedCategory,
    categories,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));

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
    setPage(1);
  };

  const openCreate = () => {
    setEditing(null);
    setFormUnit("pcs");
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setFormUnit(row.unit === "pack" ? "pack" : "pcs");
    setModalOpen(true);
  };

  const handleSubmit = async (values) => {
    const cat = categories.find((c) => c.id === values.category_id);

    const payload = {
      ...values,
      unit: values.unit === "pack" ? "pack" : "pcs",
      category_name: cat?.name || "",
      // Master centralized: owner_branch_id tidak lagi ditulis.
      owner_branch_id: undefined,
      // Field lama tidak lagi dipakai oleh UI master baru.
      product_type: undefined,
      content_per_carton: undefined,
      nicotine_level: undefined,
      volume: undefined,
    };

    if (payload.unit !== "pack") {
      payload.pack_size = 1;
    } else {
      const packSize = Number(payload.pack_size || 0);
      if (!Number.isFinite(packSize) || packSize <= 0) {
        alert("Isi per Pack wajib lebih dari 0 PCS.");
        return;
      }
      payload.pack_size = packSize;
    }

    if (!editing) {
      Object.assign(payload, nextProductIdentifiers(allProducts, cat));
      await create(payload);
    } else {
      // HBT tidak diedit manual dari master.
      payload.purchase_price = editing.purchase_price ?? 0;
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
              onClick={openCreate}
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
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Cari ID barang / nama / SKU / barcode..."
              className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <select
            value={selectedBrand}
            onChange={(event) => setSelectedBrand(event.target.value)}
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
            onChange={(event) => setSelectedCategory(event.target.value)}
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
              onChange={(event) => setPageSize(Number(event.target.value))}
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

      {productsError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {productsError}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="px-4 py-4 font-semibold">ID Barang</th>
                <th className="px-4 py-4 font-semibold">SKU</th>
                <th className="px-4 py-4 font-semibold">Nama Barang</th>
                <th className="px-4 py-4 font-semibold">Merek</th>
                <th className="px-4 py-4 font-semibold">Kategori</th>
                <th className="px-4 py-4 font-semibold">Satuan</th>
                <th className="px-4 py-4 font-semibold">HBT</th>
                <th className="px-4 py-4 font-semibold">MSRP</th>
                <th className="px-4 py-4 font-semibold">WHOLESALE</th>
                <th className="px-4 py-4 font-semibold">VIP</th>
                <th className="px-4 py-4 font-semibold">VVIP</th>
                <th className="px-4 py-4 font-semibold">Barcode</th>
                <th className="px-4 py-4 font-semibold">Status</th>
                <th className="w-[130px] px-4 py-4"></th>
              </tr>
            </thead>

            <tbody>
              {productsLoading ? (
                <tr>
                  <td colSpan={14} className="px-5 py-14 text-center text-muted-foreground">
                    Memuat seluruh master barang...
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-5 py-14 text-center text-muted-foreground">
                    Tidak ada barang yang sesuai filter.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id} className="border-b align-top last:border-b-0 hover:bg-muted/20">
                    <td className="px-4 py-4">
                      <span className="font-mono text-xs">{row.product_code || "—"}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-mono text-xs font-semibold">{row.sku || "—"}</span>
                    </td>
                    <td className="px-4 py-4 min-w-[220px]">{row.name || "—"}</td>
                    <td className="px-4 py-4">{row.brand || "—"}</td>
                    <td className="px-4 py-4">{row.category_name || "—"}</td>
                    <td className="px-4 py-4 uppercase">
                      {row.unit === "pack"
                        ? `PACK${row.pack_size ? ` (${row.pack_size} PCS)` : ""}`
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
                      <BarcodeVisual value={row.barcode} name={row.name} compact />
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
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => printBarcode(row)}
                          className="rounded-lg p-1.5 hover:bg-accent"
                          title="Cetak Barcode"
                        >
                          <Printer className="h-4 w-4 text-emerald-700" />
                        </button>

                        <button
                          onClick={() => openEdit(row)}
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
            Menampilkan {rangeStart}–{rangeEnd} dari {filteredProducts.length}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="min-w-[80px] text-center text-sm">
              {page} / {totalPages}
            </span>

            <button
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page >= totalPages}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <EntityFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        title={editing ? "Edit Barang" : "Tambah Barang"}
        fields={makeFields(categories, formUnit)}
        initialData={editing || { unit: "pcs", pack_size: 1 }}
        /*
          IMPORTANT:
          EntityFormModal existing perlu memanggil callback saat unit berubah
          agar field pack_size muncul/hilang dinamis.
          Jika EntityFormModal belum mendukung onFieldChange, patch minimal:
          onFieldChange?.(field.name, value)
          lalu pasang di sini:
          onFieldChange={(name, value) => {
            if (name === "unit") setFormUnit(value);
          }}
        */
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
