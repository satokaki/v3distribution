import React, { useState, useEffect } from "react";
import { useEntityList } from "@/lib/useEntityList";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import EntityFormModal from "@/components/EntityFormModal";
import { Plus, Pencil, Trash2 } from "lucide-react";

const FIELDS = [
  { name: "code", label: "Kode Cabang", type: "text", required: true, disabled: true, placeholder: "Otomatis" },
  { name: "name", label: "Nama Cabang", type: "text", required: true, full: true },
  { name: "branch_type", label: "Jenis", type: "select", required: true, options: ["pusat", "cabang"] },
  { name: "person_in_charge", label: "Penanggung Jawab", type: "text" },
  { name: "phone", label: "Nomor Telepon", type: "text" },
  { name: "address", label: "Alamat", type: "textarea", full: true },
  { name: "retail_enabled", label: "Penjualan Retail Aktif", type: "boolean" },
  { name: "grosir_enabled", label: "Penjualan Grosir Aktif", type: "boolean" },
  { name: "is_active", label: "Status Aktif", type: "boolean" },
  { name: "notes", label: "Catatan", type: "textarea", full: true },
];

const columns = [
  { key: "code", label: "Kode", render: (v) => <span className="font-mono text-xs font-semibold">{v}</span> },
  { key: "name", label: "Nama Cabang" },
  { key: "branch_type", label: "Jenis", render: (v) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === "pusat" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
      {v === "pusat" ? "Pusat" : "Cabang"}
    </span>
  ) },
  { key: "person_in_charge", label: "PJ" },
  { key: "phone", label: "Telepon" },
  { key: "is_active", label: "Status", render: (v) => (
    <span className={`px-2 py-0.5 rounded-full text-xs ${v ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {v ? "Aktif" : "Nonaktif"}
    </span>
  ) },
];

export default function Branches() {
  const { data, loading, create, update, remove, nextCode } = useEntityList("Branch", { codePrefix: "CBG" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (row) => { setEditing(row); setModalOpen(true); };

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
        title="Master Cabang"
        subtitle="Kelola data cabang, pusat, dan pengaturan retail/grosir"
        action={
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Tambah Cabang
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={["code", "name", "person_in_charge", "phone"]}
        searchPlaceholder="Cari kode / nama cabang..."
        rowActions={(row) => (
          <>
            <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg hover:bg-accent" title="Edit">
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={() => { if (confirm("Hapus cabang ini?")) remove(row.id); }} className="p-1.5 rounded-lg hover:bg-accent" title="Hapus">
              <Trash2 className="w-4 h-4 text-destructive" />
            </button>
          </>
        )}
      />
      <EntityFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        title={editing ? "Edit Cabang" : "Tambah Cabang"}
        fields={FIELDS}
        initialData={editing || {}}
      />
    </div>
  );
}