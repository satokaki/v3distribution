import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEntityList } from "@/lib/useEntityList";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import EntityFormModal from "@/components/EntityFormModal";
import { formatCurrency } from "@/lib/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";

const FIELDS = (branches) => [
  { name: "code", label: "Kode Pelanggan", type: "text", required: true, disabled: true, placeholder: "Otomatis" },
  { name: "name", label: "Nama Pelanggan", type: "text", required: true, full: true },
  { name: "store_name", label: "Nama Toko", type: "text" },
  { name: "customer_type", label: "Tipe", type: "select", options: ["retail", "grosir", "reseller", "distributor"] },
  { name: "phone", label: "Nomor Telepon", type: "text" },
  { name: "city", label: "Kota", type: "text" },
  { name: "area", label: "Area", type: "text" },
  { name: "address", label: "Alamat", type: "textarea", full: true },
  { name: "credit_limit", label: "Limit Kredit", type: "number" },
  { name: "payment_terms", label: "Tempo Pembayaran (hari)", type: "number" },
  { name: "owner_branch_id", label: "Cabang Pemilik", type: "select", options: branches.map(b => ({ value: b.id, label: `${b.code} — ${b.name}` })) },
  { name: "sync_enabled", label: "Sinkron Antar Cabang", type: "boolean" },
  { name: "is_active", label: "Status Aktif", type: "boolean" },
];

const columns = [
  { key: "code", label: "Kode", render: (v) => <span className="font-mono text-xs font-semibold">{v}</span> },
  { key: "name", label: "Nama Pelanggan" },
  { key: "store_name", label: "Toko" },
  { key: "customer_type", label: "Tipe", render: (v) => (
    <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground capitalize">{v}</span>
  ) },
  { key: "phone", label: "Telepon" },
  { key: "city", label: "Kota" },
  { key: "credit_limit", label: "Limit Kredit", render: (v) => formatCurrency(v) },
  { key: "is_active", label: "Status", render: (v) => (
    <span className={`px-2 py-0.5 rounded-full text-xs ${v ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {v ? "Aktif" : "Nonaktif"}
    </span>
  ) },
];

export default function Customers() {
  const { data, loading, create, update, remove, nextCode } = useEntityList("Customer", { codePrefix: "CUS" });
  const [branches, setBranches] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { base44.entities.Branch.list().then(setBranches); }, []);

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
        title="Master Pelanggan"
        subtitle="Kelola data pelanggan retail, grosir, reseller, dan distributor"
        action={
          <button onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Tambah Pelanggan
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={["code", "name", "store_name", "phone", "city"]}
        searchPlaceholder="Cari pelanggan..."
        rowActions={(row) => (
          <>
            <button onClick={() => { setEditing(row); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-accent"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
            <button onClick={() => { if (confirm("Hapus pelanggan ini?")) remove(row.id); }} className="p-1.5 rounded-lg hover:bg-accent"><Trash2 className="w-4 h-4 text-destructive" /></button>
          </>
        )}
      />
      <EntityFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} title={editing ? "Edit Pelanggan" : "Tambah Pelanggan"} fields={FIELDS(branches)} initialData={editing || {}} />
    </div>
  );
}