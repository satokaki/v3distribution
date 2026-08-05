import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import InterbranchFormModal from "@/components/InterbranchFormModal";
import { writeAuditLog } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";

function StatusBadge({ value }) {
  const map = { draft: "bg-amber-100 text-amber-700", posted: "bg-emerald-100 text-emerald-700" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[value] || "bg-muted text-muted-foreground"}`}>{value}</span>;
}

export default function JualBeliCabang() {
  const { toast } = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const items = await base44.entities.InterbranchTransaction.list("-created_date", 500);
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
      toast({ title: "Transaksi posted tidak bisa dihapus", variant: "destructive" });
      return;
    }
    await base44.entities.InterbranchTransaction.delete(row.id);
    await writeAuditLog({ action: "delete_interbranch_draft", module: "jual-beli-cabang", description: `Hapus draft ${row.code}`, branchId: row.seller_branch_id });
    toast({ title: "Draft dihapus" });
    await load();
  };

  const columns = [
    { key: "code", label: "Kode", className: "font-medium" },
    { key: "date", label: "Tanggal", render: (v) => (v ? v.slice(0, 10) : "—") },
    { key: "seller_branch_name", label: "Penjual", render: (v, r) => v ? `${r.seller_branch_code || ""} · ${v}` : "—" },
    { key: "buyer_branch_name", label: "Pembeli", render: (v, r) => v ? `${r.buyer_branch_code || ""} · ${v}` : "—" },
    { key: "total", label: "Total", render: (v) => formatCurrency(v || 0), className: "text-right" },
    { key: "status", label: "Status", render: (v) => <StatusBadge value={v} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Jual Beli Cabang"
        subtitle="Transaksi jual-beli antar cabang dengan harga interbranch"
        action={
          <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            + Transaksi Baru
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={["code", "seller_branch_name", "buyer_branch_name"]}
        searchPlaceholder="Cari kode / cabang..."
        rowActions={(row) => (
          <button onClick={() => handleDelete(row)} className="px-2 py-1 text-xs rounded-lg text-destructive hover:bg-destructive/10">
            Hapus
          </button>
        )}
      />
      <InterbranchFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} existingCount={data.length} />
    </div>
  );
}