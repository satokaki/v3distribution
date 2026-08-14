import React, { useEffect, useMemo, useState, useCallback } from "react";
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
} from "lucide-react";

const PRODUCT_READ_BATCH = 500;
const PRODUCT_READ_MAX = 100000;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const FIELDS = (categories, branches) => [
  { name: "product_code", label: "ID Barang", type: "text", disabled: true, placeholder: "Otomatis" },
  { name: "sku", label: "SKU", type: "text", required: true, disabled: true, placeholder: "Otomatis" },
  { name: "barcode", label: "Barcode", type: "text" },
  { name: "name", label: "Nama Barang", type: "text", required: true, full: true },
  { name: "brand", label: "Merek", type: "text" },
  {
    name: "category_id",
    label: "Kategori",
    type: "select",
    options: categories.map((c) => ({ value: c.id, label: c.name })),
  },
  { name: "subcategory", label: "Subkategori", type: "text" },
  { name: "product_type", label: "Jenis Barang", type: "text" },
  { name: "unit", label: "Satuan", type: "text", default: "pcs" },
  { name: "content_per_carton", label: "Isi per Karton", type: "number" },
  { name: "nicotine_level", label: "Kadar Nikotin", type: "text" },
  { name: "volume", label: "Volume", type: "text" },
  { name: "purchase_price", label: "Harga Beli", type: "number" },
  { name: "retail_price", label: "Harga Retail", type: "number" },
  { name: "grosir_price", label: "Harga Grosir", type: "number" },
  { name: "interbranch_price", label: "Harga Antar Cabang", type: "number" },
  { name: "min_stock", label: "Minimum Stok", type: "number" },
  {
    name: "owner_branch_id",
    label: "Cabang Pemilik",
    type: "select",
    options: branches.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` })),
  },
  { name: "sync_enabled", label: "Sinkron Antar Cabang", type: "boolean" },
  { name: "is_active", label: "Status Aktif", type: "boolean" },
];

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

export default function Products() {
  // Hook tetap dipakai untuk helper CRUD existing.
  const {
    create,
    update,
    remove,
  } = useEntityList("Product");

  const [allProducts, setAllProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");

  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const reloadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError("");

    try {
      const rows = await listAllProducts();
      setAllProducts(rows);
    } catch (error) {
      console.error("Gagal memuat seluruh Product:", error);
      setProductsError(error?.message || "Gagal memuat master barang.");
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadProducts();

    Promise.all([
      base44.entities.ProductCategory.list("-created_date", 5000, 0),
      base44.entities.Branch.list("-created_date", 5000, 0),
    ]).then(([categoryRows, branchRows]) => {
      setCategories(categoryRows);
      setBranches(branchRows);
    });
  }, [reloadProducts]);

  const brands = useMemo(() => {
    return [...new Set(
      allProducts
        .map((product) => String(product.brand || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "id"));
  }, [allProducts]);

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

  const rangeStart = filteredProducts.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, filteredProducts.length);

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedBrand("all");
    setSelectedCategory("all");
    setPage(1);
  };

  const handleSubmit = async (values) => {
    const cat = categories.find((c) => c.id === values.category_id);

    const payload = {
      ...values,
      category_name: cat?.name || "",
    };

    if (!editing) {
      // Generator memakai seluruh master yang dimuat, bukan hanya 500 record pertama.
      Object.assign(payload, nextProductIdentifiers(allProducts, cat));
      await create(payload);
    } else {
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
        subtitle="Kelola produk vape: liquid, device, pod, coil, disposable, dll"
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
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
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
          <table className="w-full min-w-[950px] text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="px-5 py-4 font-semibold">ID Barang</th>
                <th className="px-5 py-4 font-semibold">SKU</th>
                <th className="px-5 py-4 font-semibold">Nama Barang</th>
                <th className="px-5 py-4 font-semibold">Merek</th>
                <th className="px-5 py-4 font-semibold">Kategori</th>
                <th className="px-5 py-4 font-semibold">Satuan</th>
                <th className="px-5 py-4 font-semibold">Harga Retail</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="w-[90px] px-5 py-4"></th>
              </tr>
            </thead>

            <tbody>
              {productsLoading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-muted-foreground">
                    Memuat seluruh master barang...
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-muted-foreground">
                    Tidak ada barang yang sesuai filter.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs">{row.product_code || "—"}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs font-semibold">{row.sku || "—"}</span>
                    </td>
                    <td className="px-5 py-4">{row.name || "—"}</td>
                    <td className="px-5 py-4">{row.brand || "—"}</td>
                    <td className="px-5 py-4">{row.category_name || "—"}</td>
                    <td className="px-5 py-4">{row.unit || "—"}</td>
                    <td className="px-5 py-4 font-medium">{formatCurrency(row.retail_price)}</td>
                    <td className="px-5 py-4">
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
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
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
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        title={editing ? "Edit Barang" : "Tambah Barang"}
        fields={FIELDS(categories, branches)}
        initialData={editing || {}}
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