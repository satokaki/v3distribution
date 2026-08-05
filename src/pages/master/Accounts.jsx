import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEntityList } from "@/lib/useEntityList";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import EntityFormModal from "@/components/EntityFormModal";
import { formatCurrency } from "@/lib/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";

const FIELDS = (branches) => [
  { name: "code", label: "Kode Rekening", type: "text", required: true, disabled: true, placeholder: "Otomatis" },
  { name: "name", label: "Nama Rekening", type: "text", required: true, full: true },
  { name: "branch_id", label: "Cabang", type: "select", required: true, options: branches.map(b => ({ value: b.id, label: `${b.code} — ${b.name}` })) },
  { name: "account_type", label: "Jenis", type: "select", options: ["kas", "bank", "ewallet", "clearing"] },
  { name: "opening_balance", label: "Saldo Awal", type: "number" },
  { name: "is_active", label: "Status Aktif", type: "boolean" },
];

const columns = [
  { key: "code", label: "Kode", render: (v) => <span className="font-mono text-xs font-semibold">{v}</span> },
  { key: "name", label: "Nama Rekening" },
  { key: "branch_code", label: "Cabang" },
  { key: "account_type", label: "Jenis", render: (v) => (
    <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground capitalize">{v}</span>
  ) },
  { key: "opening_balance", label: "Saldo Awal", render: (v) => formatCurrency(v) },
  { key: "current_balance", label: "Saldo Berjalan", render: (v) => <span className="font-medium">{formatCurrency(v)}</span> },
  { key: "is_active", label: "Status", render: (v) => (
    <span className={`px-2 py-0.5 rounded-full text-xs ${v ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {v ? "Aktif" : "Nonaktif"}
    </span>
  ) },
];

export default function Accounts() {
  const { data, loading, create, update, remove, nextCode } = useEntityList("Account", { codePrefix: "REK" });
  const [branches, setBranches] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { base44.entities.Branch.list().then(setBranches); }, []);

  const handleSubmit = async (values) => {
    const branch = branches.find(b => b.id === values.branch_id);
    const payload = { ...values, branch_code: branch?.code || "", current_balance: values.opening_balance || 0 };
    if (!editing) payload.code = nextCode();
    if (editing) await update(editing.id, payload);
    else await create(payload);
    setModalOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="Master Rekening"
        subtitle="Kelola rekening kas, bank, e-wallet, dan clearing per cabang"
        action={
          <button onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Tambah Rekening
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={["code", "name", "branch_code", "account_type"]}
        searchPlaceholder="Cari rekening..."
        rowActions={(row) => (
          <>
            <button onClick={() => { setEditing(row); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-accent"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
            <button onClick={() => { if (confirm("Hapus rekening ini?")) remove(row.id); }} className="p-1.5 rounded-lg hover:bg-accent"><Trash2 className="w-4 h-4 text-destructive" /></button>
          </>
        )}
      />
      <EntityFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} title={editing ? "Edit Rekening" : "Tambah Rekening"} fields={FIELDS(branches)} initialData={editing || {}} />
    </div>
  );
}