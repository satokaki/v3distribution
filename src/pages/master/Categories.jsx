import React, { useState } from "react";
import { useEntityList } from "@/lib/useEntityList";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import EntityFormModal from "@/components/EntityFormModal";
import { Plus, Pencil, Trash2 } from "lucide-react";

const FIELDS = [
  { name: "code", label: "Kode Kategori", type: "text", required: true, disabled: true, placeholder: "Otomatis" },
  { name: "name", label: "Nama Kategori", type: "text", required: true, full: true },
  { name: "description", label: "Deskripsi", type: "textarea", full: true },
  { name: "sync_enabled", label: "Sinkron Antar Cabang", type: "boolean" },
  { name: "is_active", label: "Status Aktif", type: "boolean" },
];

const columns = [
  { key: "code", label: "Kode", render: (v) => <span className="font-mono text-xs font-semibold">{v}</span> },
  { key: "name", label: "Nama Kategori" },
  { key: "description", label: "Deskripsi" },
  { key: "sync_enabled", label: "Sinkron", render: (v) => (
    <span className={`px-2 py-0.5 rounded-full text-xs ${v ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
      {v ? "Ya" : "Tidak"}
    </span>
  ) },
  { key: "is_active", label: "Status", render: (v) => (
    <span className={`px-2 py-0.5 rounded-full text-xs ${v ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {v ? "Aktif" : "Nonaktif"}
    </span>
  ) },
];

export default function Categories() {
  const { data, loading, create, update, remove, nextCode } = useEntityList("ProductCategory", { codePrefix: "KAT" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const handleSubmit = async (values) => {
    const payload = { ...values };
    if (!editing) payload.code = nextCode();
    if (editing) await update(editing.id, payload);
    else await create(payload);
    setModalOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="Master Kategori"
        subtitle="Kategori barang: Liquid, Device, Pod, Coil, Disposable, dll"
        action={
          <button onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Tambah Kategori
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={["code", "name"]}
        searchPlaceholder="Cari kategori..."
        rowActions={(row) => (
          <>
            <button onClick={() => { setEditing(row); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-accent"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
            <button onClick={() => { if (confirm("Hapus kategori ini?")) remove(row.id); }} className="p-1.5 rounded-lg hover:bg-accent"><Trash2 className="w-4 h-4 text-destructive" /></button>
          </>
        )}
      />
      <EntityFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} title={editing ? "Edit Kategori" : "Tambah Kategori"} fields={FIELDS} initialData={editing || {}} />
    </div>
  );
}