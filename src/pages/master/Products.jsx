import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEntityList } from "@/lib/useEntityList";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import EntityFormModal from "@/components/EntityFormModal";
import ProductImportModal from "@/components/ProductImportModal";
import { formatCurrency } from "@/lib/utils";
import { nextProductIdentifiers } from "@/lib/productImportCore";
import { FileUp, Plus, Pencil, Trash2 } from "lucide-react";

const FIELDS = (categories, branches) => [
  { name: "product_code", label: "ID Barang", type: "text", disabled: true, placeholder: "Otomatis" },
  { name: "sku", label: "SKU", type: "text", required: true, disabled: true, placeholder: "Otomatis" },
  { name: "barcode", label: "Barcode", type: "text" },
  { name: "name", label: "Nama Barang", type: "text", required: true, full: true },
  { name: "brand", label: "Merek", type: "text" },
  { name: "category_id", label: "Kategori", type: "select", options: categories.map(c => ({ value: c.id, label: c.name })) },
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
  { name: "owner_branch_id", label: "Cabang Pemilik", type: "select", options: branches.map(b => ({ value: b.id, label: `${b.code} — ${b.name}` })) },
  { name: "sync_enabled", label: "Sinkron Antar Cabang", type: "boolean" },
  { name: "is_active", label: "Status Aktif", type: "boolean" },
];

const columns = [
  { key: "product_code", label: "ID Barang", render: (v) => <span className="font-mono text-xs">{v || "—"}</span> },
  { key: "sku", label: "SKU", render: (v) => <span className="font-mono text-xs font-semibold">{v}</span> },
  { key: "name", label: "Nama Barang" },
  { key: "brand", label: "Merek" },
  { key: "category_name", label: "Kategori" },
  { key: "unit", label: "Satuan" },
  { key: "retail_price", label: "Harga Retail", render: (v) => <span className="font-medium">{formatCurrency(v)}</span> },
  { key: "is_active", label: "Status", render: (v) => (
    <span className={`px-2 py-0.5 rounded-full text-xs ${v ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {v ? "Aktif" : "Nonaktif"}
    </span>
  ) },
];

export default function Products() {
  const { data, loading, create, update, remove, reload } = useEntityList("Product");
  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    base44.entities.ProductCategory.list().then(setCategories);
    base44.entities.Branch.list().then(setBranches);
  }, []);

  const handleSubmit = async (values) => {
    const cat = categories.find(c => c.id === values.category_id);
    const payload = { ...values, category_name: cat?.name || "" };
    if (!editing) Object.assign(payload, nextProductIdentifiers(data));
    if (editing) await update(editing.id, payload);
    else await create(payload);
    setModalOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="Master Barang"
        subtitle="Kelola produk vape: liquid, device, pod, coil, disposable, dll"
        action={<div className="flex flex-wrap gap-2"><button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"><FileUp className="h-4 w-4" /> Import Barang</button><button onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"><Plus className="w-4 h-4" /> Tambah Barang</button></div>}
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={["product_code", "sku", "barcode", "name", "brand"]}
        searchPlaceholder="Cari ID barang / nama / SKU / barcode..."
        rowActions={(row) => (
          <>
            <button onClick={() => { setEditing(row); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-accent"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
            <button onClick={() => { if (confirm("Hapus barang ini?")) remove(row.id); }} className="p-1.5 rounded-lg hover:bg-accent"><Trash2 className="w-4 h-4 text-destructive" /></button>
          </>
        )}
      />
      <EntityFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} title={editing ? "Edit Barang" : "Tambah Barang"} fields={FIELDS(categories, branches)} initialData={editing || {}} />
      <ProductImportModal open={importOpen} onClose={() => setImportOpen(false)} products={data} categories={categories} onCommit={async (records) => { for (let index = 0; index < records.length; index += 100) await base44.entities.Product.bulkCreate(records.slice(index, index + 100)); await reload(); }} />
    </div>
  );
}
