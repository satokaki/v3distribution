import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEntityList } from "@/lib/useEntityList";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import EntityFormModal from "@/components/EntityFormModal";
import { Plus, Pencil, Trash2 } from "lucide-react";

const FIELDS = (branches) => [
  { name: "code", label: "Kode Sales", type: "text", required: true, disabled: true, placeholder: "Otomatis" },
  { name: "name", label: "Nama Sales", type: "text", required: true, full: true },
  { name: "branch_id", label: "Cabang", type: "select", required: true, options: branches.map(b => ({ value: b.id, label: `${b.code} — ${b.name}` })) },
  { name: "phone", label: "Nomor Telepon", type: "text" },
  { name: "join_date", label: "Tanggal Bergabung", type: "date" },
  { name: "notes", label: "Catatan", type: "textarea", full: true },
  { name: "is_active", label: "Status Aktif", type: "boolean" },
];

const columns = [
  { key: "code", label: "Kode", render: (v) => <span className="font-mono text-xs font-semibold">{v}</span> },
  { key: "name", label: "Nama Sales" },
  { key: "branch_code", label: "Cabang" },
  { key: "phone", label: "Telepon" },
  { key: "join_date", label: "Bergabung" },
  { key: "is_active", label: "Status", render: (v) => (
    <span className={`px-2 py-0.5 rounded-full text-xs ${v ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {v ? "Aktif" : "Nonaktif"}
    </span>
  ) },
];

export default function Salespersons() {
  const { data, loading, create, update, remove, nextCode } = useEntityList("Salesperson", { codePrefix: "SLS" });
  const [branches, setBranches] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { base44.entities.Branch.list().then(setBranches); }, []);

  const handleSubmit = async (values) => {
    const branch = branches.find(b => b.id === values.branch_id);
    const payload = { ...values, branch_code: branch?.code || "" };
    if (!editing) payload.code = nextCode();
    if (editing) await update(editing.id, payload);
    else await create(payload);
    setModalOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="Master Sales"
        subtitle="Data sales untuk pencatatan transaksi dan komisi"
        action={
          <button onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Tambah Sales
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={["code", "name", "branch_code", "phone"]}
        searchPlaceholder="Cari sales..."
        rowActions={(row) => (
          <>
            <button onClick={() => { setEditing(row); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-accent"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
            <button onClick={() => { if (confirm("Hapus sales ini?")) remove(row.id); }} className="p-1.5 rounded-lg hover:bg-accent"><Trash2 className="w-4 h-4 text-destructive" /></button>
          </>
        )}
      />
      <EntityFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} title={editing ? "Edit Sales" : "Tambah Sales"} fields={FIELDS(branches)} initialData={editing || {}} />
    </div>
  );
}