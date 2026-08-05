import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import TambahPiutangModal from "@/components/TambahPiutangModal";
import PelunasanPiutangModal from "@/components/PelunasanPiutangModal";
import { writeAuditLog } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";

const STATUS_STYLE = { unpaid: "bg-rose-100 text-rose-700", partial: "bg-amber-100 text-amber-700", paid: "bg-emerald-100 text-emerald-700" };
const STATUS_LABEL = { unpaid: "Belum Bayar", partial: "Sebagian", paid: "Lunas" };

export default function Piutang() {
  const { toast } = useToast();
  const { accessibleBranches, isSuperAdmin } = useBranchContext();
  const [data, setData] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [pelunasanTarget, setPelunasanTarget] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [r, pm] = await Promise.all([
        base44.entities.Receivable.list("-date", 500),
        base44.entities.ReceivablePayment.list("-date", 500),
      ]);
      let items = r || [];
      if (!isSuperAdmin) {
        const ids = accessibleBranches.map((b) => b.branch_id);
        items = items.filter((x) => ids.includes(x.branch_id));
      }
      setData(items);
      setPayments(pm || []);
    } catch {
      toast({ title: "Gagal memuat data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => data.filter((x) => !filterStatus || x.status === filterStatus), [data, filterStatus]);

  const totalPiutang = filtered.reduce((s, x) => s + (x.amount || 0), 0);
  const totalTerbayar = filtered.reduce((s, x) => s + (x.paid_amount || 0), 0);
  const sisa = totalPiutang - totalTerbayar;

  const handleDelete = async (row) => {
    if ((row.paid_amount || 0) > 0) {
      toast({ title: "Piutang sudah ada pembayaran, tidak bisa dihapus", variant: "destructive" });
      return;
    }
    await base44.entities.Receivable.delete(row.id);
    await writeAuditLog({ action: "delete_piutang", module: "piutang", description: `Hapus piutang ${row.code}`, branchId: row.branch_id });
    toast({ title: "Piutang dihapus" });
    await load();
  };

  const columns = [
    { key: "code", label: "Kode", className: "font-medium" },
    { key: "date", label: "Tanggal", render: (v) => (v ? v.slice(0, 10) : "—") },
    { key: "due_date", label: "Jatuh Tempo", render: (v) => (v ? v.slice(0, 10) : "—") },
    { key: "customer_name", label: "Pelanggan" },
    { key: "amount", label: "Nilai", render: (v) => formatCurrency(v || 0), className: "text-right" },
    { key: "paid_amount", label: "Terbayar", render: (v) => formatCurrency(v || 0), className: "text-right" },
    { key: "sisa", label: "Sisa", render: (v, r) => <span className="font-medium">{formatCurrency((r.amount || 0) - (r.paid_amount || 0))}</span>, className: "text-right" },
    { key: "status", label: "Status", render: (v) => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[v]}`}>{STATUS_LABEL[v]}</span> },
  ];

  const selectCls = "px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div>
      <PageHeader
        title="Piutang"
        subtitle="Piutang dari pelanggan & pelunasan"
        action={
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            + Catat Piutang
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Piutang</div>
          <div className="text-xl font-bold mt-1">{formatCurrency(totalPiutang)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Terbayar</div>
          <div className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(totalTerbayar)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Sisa Outstanding</div>
          <div className="text-xl font-bold text-rose-600 mt-1">{formatCurrency(sisa)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectCls}>
          <option value="">Semua Status</option>
          <option value="unpaid">Belum Bayar</option>
          <option value="partial">Sebagian</option>
          <option value="paid">Lunas</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchKeys={["code", "customer_name"]}
        searchPlaceholder="Cari kode / pelanggan..."
        rowActions={(row) => {
          const sisaRow = (row.amount || 0) - (row.paid_amount || 0);
          return (
            <div className="flex items-center gap-1">
              {sisaRow > 0 && (
                <button onClick={() => setPelunasanTarget(row)} className="px-2 py-1 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-medium">
                  Pelunasan
                </button>
              )}
              {sisaRow <= 0 && (
                <button onClick={() => handleDelete(row)} className="px-2 py-1 text-xs rounded-lg text-destructive hover:bg-destructive/10">
                  Hapus
                </button>
              )}
            </div>
          );
        }}
      />

      <TambahPiutangModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} existingCount={data.length} />
      <PelunasanPiutangModal receivable={pelunasanTarget} open={!!pelunasanTarget} onClose={() => setPelunasanTarget(null)} onSaved={load} existingCount={payments.length} />
    </div>
  );
}