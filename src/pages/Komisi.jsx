import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import BayarKomisiModal from "@/components/BayarKomisiModal";
import { writeAuditLog } from "@/lib/audit";
import { generateCode, formatCurrency } from "@/lib/utils";
import { Loader2, Sparkles } from "lucide-react";

const STATUS_STYLE = { accrued: "bg-amber-100 text-amber-700", paid: "bg-emerald-100 text-emerald-700" };
const STATUS_LABEL = { accrued: "Belum Dibayar", paid: "Dibayar" };

export default function Komisi() {
  const { toast } = useToast();
  const { accessibleBranches, isSuperAdmin } = useBranchContext();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSales, setFilterSales] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const c = await base44.entities.Commission.list("-date", 500);
      let items = c || [];
      if (!isSuperAdmin) {
        const ids = accessibleBranches.map((b) => b.branch_id);
        items = items.filter((x) => ids.includes(x.branch_id));
      }
      setData(items);
    } catch {
      toast({ title: "Gagal memuat data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => data.filter((x) => (!filterStatus || x.status === filterStatus) && (!filterSales || x.salesperson_id === filterSales)), [data, filterStatus, filterSales]);

  const totalKomisi = filtered.reduce((s, x) => s + (x.amount || 0), 0);
  const totalDibayar = filtered.filter((x) => x.status === "paid").reduce((s, x) => s + (x.amount || 0), 0);
  const sisa = totalKomisi - totalDibayar;

  const salespeopleOptions = useMemo(() => {
    const map = new Map();
    data.forEach((x) => { if (x.salesperson_id) map.set(x.salesperson_id, { id: x.salesperson_id, name: x.salesperson_name }); });
    return [...map.values()];
  }, [data]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const [sales, salespeople] = await Promise.all([
        base44.entities.Sale.list("-date", 500),
        base44.entities.Salesperson.list(),
      ]);
      const posted = (sales || []).filter((s) => s.status === "posted" && s.salesperson_id);
      const existingSaleIds = new Set(data.map((c) => c.sale_id).filter(Boolean));
      const spMap = new Map((salespeople || []).map((s) => [s.id, s]));
      const toCreate = [];
      posted.forEach((s) => {
        if (existingSaleIds.has(s.id)) return;
        const sp = spMap.get(s.salesperson_id);
        const rate = sp?.commission_rate || 0;
        if (!rate) return;
        toCreate.push({
          code: generateCode("KMS", data.length + toCreate.length, 5),
          date: (s.date || "").slice(0, 10),
          salesperson_id: s.salesperson_id, salesperson_name: s.salesperson_name || sp?.name || "",
          branch_id: s.branch_id, branch_code: s.branch_code || "",
          sale_id: s.id, sale_code: s.code, sale_total: s.total || 0,
          rate, amount: Math.round((s.total || 0) * rate / 100),
          status: "accrued",
        });
      });
      if (toCreate.length === 0) {
        toast({ title: "Tidak ada komisi baru untuk digenerate" });
      } else {
        await base44.entities.Commission.bulkCreate(toCreate);
        await writeAuditLog({ action: "generate_komisi", module: "komisi", description: `Generate ${toCreate.length} komisi dari penjualan` });
        toast({ title: `${toCreate.length} komisi digenerate` });
      }
      await load();
    } catch (err) {
      toast({ title: "Gagal generate komisi", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const columns = [
    { key: "code", label: "Kode", className: "font-medium" },
    { key: "date", label: "Tanggal", render: (v) => (v ? v.slice(0, 10) : "—") },
    { key: "salesperson_name", label: "Sales" },
    { key: "sale_code", label: "Penjualan" },
    { key: "sale_total", label: "Nilai Jual", render: (v) => formatCurrency(v || 0), className: "text-right" },
    { key: "rate", label: "Rate", render: (v) => `${v || 0}%`, className: "text-center" },
    { key: "amount", label: "Komisi", render: (v) => <span className="font-medium">{formatCurrency(v || 0)}</span>, className: "text-right" },
    { key: "status", label: "Status", render: (v) => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[v]}`}>{STATUS_LABEL[v]}</span> },
  ];

  const selectCls = "px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div>
      <PageHeader
        title="Komisi Sales"
        subtitle="Komisi dari penjualan & pembayaran"
        action={
          <button onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate dari Penjualan
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Komisi</div>
          <div className="text-xl font-bold mt-1">{formatCurrency(totalKomisi)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Sudah Dibayar</div>
          <div className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(totalDibayar)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Belum Dibayar</div>
          <div className="text-xl font-bold text-rose-600 mt-1">{formatCurrency(sisa)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectCls}>
          <option value="">Semua Status</option>
          <option value="accrued">Belum Dibayar</option>
          <option value="paid">Dibayar</option>
        </select>
        <select value={filterSales} onChange={(e) => setFilterSales(e.target.value)} className={selectCls}>
          <option value="">Semua Sales</option>
          {salespeopleOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchKeys={["code", "salesperson_name", "sale_code"]}
        searchPlaceholder="Cari kode / sales / penjualan..."
        rowActions={(row) => row.status === "accrued" ? (
          <button onClick={() => setPayTarget(row)} className="px-2 py-1 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-medium">Bayar</button>
        ) : null}
      />

      <BayarKomisiModal commission={payTarget} open={!!payTarget} onClose={() => setPayTarget(null)} onSaved={load} />
    </div>
  );
}