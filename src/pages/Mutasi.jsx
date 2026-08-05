import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import MutasiFormModal from "@/components/MutasiFormModal";
import { writeAuditLog } from "@/lib/audit";

function StatusBadge({ value }) {
  const map = { draft: "bg-amber-100 text-amber-700", posted: "bg-emerald-100 text-emerald-700" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[value] || "bg-muted text-muted-foreground"}`}>{value}</span>;
}

export default function Mutasi() {
  const { toast } = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const items = await base44.entities.StockTransfer.list("-created_date", 500);
      setData(items || []);
    } catch {
      toast({ title: "Gagal memuat data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (row) => {
    if (row.status === "posted") {
      toast({ title: "Mutasi posted tidak bisa dihapus", variant: "destructive" });
      return;
    }
    await base44.entities.StockTransfer.delete(row.id);
    await writeAuditLog({ action: "delete_transfer_draft", module: "mutasi", description: `Hapus draft mutasi ${row.code}`, branchId: row.from_branch_id });
    toast({ title: "Draft dihapus" });
    await load();
  };

  const columns = [
    { key: "code", label: "Kode", className: "font-medium" },
    { key: "date", label: "Tanggal", render: (v) => (v ? v.slice(0, 10) : "—") },
    { key: "from_branch_name", label: "Asal", render: (v, r) => v ? `${r.from_branch_code || ""} · ${v}` : "—" },
    { key: "to_branch_name", label: "Tujuan", render: (v, r) => v ? `${r.to_branch_code || ""} · ${v}` : "—" },
    { key: "total_qty", label: "Total Qty", className: "text-right" },
    { key: "status", label: "Status", render: (v) => <StatusBadge value={v} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Mutasi Cabang"
        subtitle="Transfer stok antar cabang / gudang"
        action={
          <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            + Mutasi Baru
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={["code", "from_branch_name", "to_branch_name"]}
        searchPlaceholder="Cari kode / cabang..."
        rowActions={(row) => (
          <button onClick={() => handleDelete(row)} className="px-2 py-1 text-xs rounded-lg text-destructive hover:bg-destructive/10">
            Hapus
          </button>
        )}
      />
      <MutasiFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} existingCount={data.length} />
    </div>
  );
}