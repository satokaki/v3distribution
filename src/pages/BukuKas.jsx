import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import CashTransactionFormModal from "@/components/CashTransactionFormModal";
import { writeAuditLog } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";

export default function BukuKas() {
  const { toast } = useToast();
  const { accessibleBranches, isSuperAdmin } = useBranchContext();
  const [data, setData] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterAccount, setFilterAccount] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [tx, a] = await Promise.all([
        base44.entities.CashTransaction.list("-date", 500),
        base44.entities.Account.list(),
      ]);
      let items = tx || [];
      // scope per akses cabang
      if (!isSuperAdmin) {
        const ids = accessibleBranches.map((b) => b.branch_id);
        items = items.filter((x) => ids.includes(x.branch_id));
      }
      setData(items);
      setAccounts(a || []);
    } catch {
      toast({ title: "Gagal memuat data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return data.filter((x) => {
      if (filterAccount && x.account_id !== filterAccount) return false;
      if (filterType && x.type !== filterType) return false;
      if (filterFrom && x.date && x.date.slice(0, 10) < filterFrom) return false;
      if (filterTo && x.date && x.date.slice(0, 10) > filterTo) return false;
      return true;
    });
  }, [data, filterAccount, filterType, filterFrom, filterTo]);

  const totalIn = filtered.filter((x) => x.type === "in").reduce((s, x) => s + (x.amount || 0), 0);
  const totalOut = filtered.filter((x) => x.type === "out").reduce((s, x) => s + (x.amount || 0), 0);
  const net = totalIn - totalOut;
  const activeAccount = accounts.find((a) => a.id === filterAccount);

  const handleDelete = async (row) => {
    // rollback saldo
    const account = accounts.find((a) => a.id === row.account_id);
    const rollback = (account?.current_balance || 0) + (row.type === "in" ? -(row.amount || 0) : (row.amount || 0));
    await base44.entities.CashTransaction.delete(row.id);
    if (account) await base44.entities.Account.update(row.account_id, { current_balance: rollback });
    await writeAuditLog({ action: "delete_cash", module: "buku-kas", description: `Hapus transaksi kas ${row.code}`, branchId: row.branch_id });
    toast({ title: "Transaksi dihapus & saldo dikembalikan" });
    await load();
  };

  const columns = [
    { key: "code", label: "Kode", className: "font-medium" },
    { key: "date", label: "Tanggal", render: (v) => (v ? v.slice(0, 10) : "—") },
    { key: "account_name", label: "Rekening" },
    { key: "category", label: "Kategori" },
    { key: "description", label: "Keterangan", render: (v) => v || "—" },
    {
      key: "type", label: "Jenis",
      render: (v) => v === "in"
        ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><ArrowDownCircle className="w-3.5 h-3.5" /> Masuk</span>
        : <span className="inline-flex items-center gap-1 text-rose-600 text-xs font-medium"><ArrowUpCircle className="w-3.5 h-3.5" /> Keluar</span>,
    },
    { key: "amount", label: "Jumlah", render: (v, r) => <span className={r.type === "in" ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>{r.type === "in" ? "+" : "−"} {formatCurrency(v || 0)}</span>, className: "text-right" },
    { key: "balance_after", label: "Saldo", render: (v) => formatCurrency(v || 0), className: "text-right" },
  ];

  const selectCls = "px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div>
      <PageHeader
        title="Buku Kas"
        subtitle="Arus kas masuk & keluar per rekening"
        action={
          <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            + Transaksi Kas
          </button>
        }
      />

      {/* Ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Masuk</div>
          <div className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(totalIn)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Keluar</div>
          <div className="text-xl font-bold text-rose-600 mt-1">{formatCurrency(totalOut)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Saldo Bersih {activeAccount ? `(${activeAccount.name})` : ""}</div>
          <div className={`text-xl font-bold mt-1 ${net >= 0 ? "text-foreground" : "text-rose-600"}`}>
            {activeAccount ? formatCurrency(activeAccount.current_balance || 0) : formatCurrency(net)}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Wallet className="w-4 h-4 text-muted-foreground" />
        <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} className={selectCls}>
          <option value="">Semua Rekening</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={selectCls}>
          <option value="">Semua Jenis</option>
          <option value="in">Masuk</option>
          <option value="out">Keluar</option>
        </select>
        <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className={selectCls} title="Dari tanggal" />
        <span className="text-muted-foreground">—</span>
        <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className={selectCls} title="Sampai tanggal" />
        {(filterAccount || filterType || filterFrom || filterTo) && (
          <button onClick={() => { setFilterAccount(""); setFilterType(""); setFilterFrom(""); setFilterTo(""); }} className="text-xs text-muted-foreground hover:text-foreground underline">reset</button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchKeys={["code", "category", "description", "account_name"]}
        searchPlaceholder="Cari transaksi..."
        rowActions={(row) => (
          <button onClick={() => handleDelete(row)} className="px-2 py-1 text-xs rounded-lg text-destructive hover:bg-destructive/10">
            Hapus
          </button>
        )}
      />

      <CashTransactionFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} existingCount={data.length} />
    </div>
  );
}