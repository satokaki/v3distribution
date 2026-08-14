import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useBranchContext } from "@/lib/BranchContext";
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Banknote,
  Boxes, CalendarDays, CircleDollarSign, Clock3, Landmark,
  PackageSearch, ReceiptText, Scale, ShoppingCart, Store, Wallet,
} from "lucide-react";
import HeadOfficeDashboard from "@/pages/HeadOfficeDashboard";

const EMPTY_DATA = {
  branches: [], products: [], customers: [], salespersons: [], accounts: [], stock: [], sales: [], purchases: [], receivables: [], payables: [],
  cashTransactions: [], stockTransfers: [], reconciliationDifference: 0,
};

const jakartaDate = (date = new Date()) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const recordDate = (record) => (record.date || record.created_date || "").slice(0, 10);
const outstanding = (item) => Math.max(0, (item.amount || 0) - (item.paid_amount || 0));

function MetricCard({ icon: Icon, label, value, detail = "", tone = "blue" }) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-600",
    green: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    red: "bg-red-500/10 text-red-600",
    purple: "bg-violet-500/10 text-violet-600",
    slate: "bg-slate-500/10 text-slate-600",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
        {detail && <span className="max-w-[55%] text-right text-[11px] leading-4 text-muted-foreground">{detail}</span>}
      </div>
      <div className="mt-3 text-xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function ActivityItem({ item }) {
  const typeConfig = {
    sale: { label: "Penjualan", icon: ShoppingCart, tone: "bg-emerald-500/10 text-emerald-600" },
    purchase: { label: "Pembelian", icon: PackageSearch, tone: "bg-amber-500/10 text-amber-600" },
    cash: { label: "Kas", icon: Wallet, tone: "bg-blue-500/10 text-blue-600" },
    transfer: { label: "Mutasi", icon: ArrowDownLeft, tone: "bg-violet-500/10 text-violet-600" },
  };
  const config = typeConfig[item.kind];
  const Icon = config.icon;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.tone}`}><Icon className="h-4 w-4" /></div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{item.code || item.description || config.label}</div>
          <div className="text-xs text-muted-foreground">{config.label} · {recordDate(item) || "—"} · {item.status || item.type || "tercatat"}</div>
        </div>
      </div>
      {item.value > 0 && <div className="shrink-0 text-sm font-semibold">{formatCurrency(item.value)}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { activeBranchId, isAllBranches, isSuperAdmin, accessibleBranches, activeBranch } = useBranchContext();
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await base44.functions.invoke("getDashboardData");
        if (!cancelled) setData({ ...EMPTY_DATA, ...(response.data || {}) });
      } catch (err) {
        if (!cancelled) setError(err.message || "Dashboard gagal dimuat");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeBranchId]);

  const scoped = useMemo(() => {
    const byBranch = (items, field = "branch_id") => isAllBranches ? items : items.filter((item) => item[field] === activeBranchId);
    const transfers = isAllBranches ? data.stockTransfers : data.stockTransfers.filter((item) => item.from_branch_id === activeBranchId || item.to_branch_id === activeBranchId);
    return {
      products: data.products,
      accounts: byBranch(data.accounts),
      stock: byBranch(data.stock),
      sales: byBranch(data.sales),
      purchases: byBranch(data.purchases),
      receivables: byBranch(data.receivables),
      cash: byBranch(data.cashTransactions),
      transfers,
    };
  }, [data, activeBranchId, isAllBranches]);

  const dashboard = useMemo(() => {
    const today = jakartaDate();
    const month = today.slice(0, 7);
    const postedSales = scoped.sales.filter((item) => item.status === "posted");
    const todaySales = postedSales.filter((item) => recordDate(item) === today);
    const monthSales = postedSales.filter((item) => recordDate(item).startsWith(month));
    const cashSales = monthSales.filter((item) => item.payment_method !== "kredit");
    const creditSales = monthSales.filter((item) => item.payment_method === "kredit");
    const runningReceivables = scoped.receivables.filter((item) => item.status !== "paid");
    const overdueReceivables = runningReceivables.filter((item) => item.due_date && item.due_date.slice(0, 10) < today);
    const productMap = Object.fromEntries(scoped.products.map((item) => [item.id, item]));
    const lowStock = scoped.stock.filter((item) => (item.quantity || 0) <= (item.min_stock || 0));
    const inventoryValue = scoped.stock.reduce((sum, item) => sum + (item.quantity || 0) * (productMap[item.product_id]?.purchase_price || 0), 0);
    const cashBalance = scoped.accounts.filter((item) => item.account_type === "kas").reduce((sum, item) => sum + (item.current_balance || 0), 0);
    const bankBalance = scoped.accounts.filter((item) => item.account_type === "bank").reduce((sum, item) => sum + (item.current_balance || 0), 0);
    const incoming = scoped.transfers.filter((item) => item.status === "posted" && (isAllBranches || item.to_branch_id === activeBranchId));
    const outgoing = scoped.transfers.filter((item) => item.status === "posted" && (isAllBranches || item.from_branch_id === activeBranchId));
    const activities = [
      ...scoped.sales.map((item) => ({ ...item, kind: "sale", value: item.total || 0 })),
      ...scoped.purchases.map((item) => ({ ...item, kind: "purchase", value: item.total || 0 })),
      ...scoped.cash.map((item) => ({ ...item, kind: "cash", value: item.amount || 0 })),
      ...scoped.transfers.map((item) => ({ ...item, kind: "transfer", value: 0 })),
    ].sort((a, b) => (b.created_date || b.date || "").localeCompare(a.created_date || a.date || "")).slice(0, 10);
    return {
      todaySales: todaySales.reduce((sum, item) => sum + (item.total || 0), 0),
      todaySalesCount: todaySales.length,
      monthSales: monthSales.reduce((sum, item) => sum + (item.total || 0), 0),
      cashSales: cashSales.reduce((sum, item) => sum + (item.total || 0), 0),
      creditSales: creditSales.reduce((sum, item) => sum + (item.total || 0), 0),
      receivable: runningReceivables.reduce((sum, item) => sum + outstanding(item), 0),
      overdue: overdueReceivables.reduce((sum, item) => sum + outstanding(item), 0),
      overdueCount: overdueReceivables.length,
      todayPurchases: scoped.purchases.filter((item) => item.status === "posted" && recordDate(item) === today).reduce((sum, item) => sum + (item.total || 0), 0),
      lowStock: lowStock.length, inventoryValue, cashBalance, bankBalance,
      incoming: incoming.reduce((sum, item) => sum + (item.total_qty || 0), 0),
      outgoing: outgoing.reduce((sum, item) => sum + (item.total_qty || 0), 0),
      activities,
    };
  }, [scoped, activeBranchId, isAllBranches]);

  const scopeLabel = isAllBranches ? "Semua Cabang" : activeBranch?.branch_name || accessibleBranches.find((item) => item.branch_id === activeBranchId)?.branch_name || "Cabang belum dipetakan";

  if (isSuperAdmin && isAllBranches) {
    return <HeadOfficeDashboard data={data} loading={loading} error={error} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Dashboard Cabang</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ringkasan operasional · {scopeLabel}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" />{jakartaDate()}</div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 12 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard icon={ShoppingCart} label="Penjualan Hari Ini" value={formatCurrency(dashboard.todaySales)} detail={`${dashboard.todaySalesCount} transaksi`} tone="green" />
            <MetricCard icon={CalendarDays} label="Penjualan Bulan Ini" value={formatCurrency(dashboard.monthSales)} tone="blue" />
            <MetricCard icon={CircleDollarSign} label="Cash vs Tempo" value={`${formatCurrency(dashboard.cashSales)} / ${formatCurrency(dashboard.creditSales)}`} detail="Cash / Tempo" tone="purple" />
            <MetricCard icon={ReceiptText} label="Piutang Berjalan" value={formatCurrency(dashboard.receivable)} tone="amber" />
            <MetricCard icon={Clock3} label="Piutang Jatuh Tempo" value={formatCurrency(dashboard.overdue)} detail={`${dashboard.overdueCount} tagihan`} tone={dashboard.overdueCount ? "red" : "green"} />
            <MetricCard icon={PackageSearch} label="Pembelian Hari Ini" value={formatCurrency(dashboard.todayPurchases)} tone="amber" />
            <MetricCard icon={AlertTriangle} label="Stok Menipis" value={formatNumber(dashboard.lowStock)} detail="SKU ≤ minimum" tone={dashboard.lowStock ? "red" : "green"} />
            <MetricCard icon={Boxes} label="Nilai Persediaan" value={formatCurrency(dashboard.inventoryValue)} detail="Harga beli × stok" tone="blue" />
            <MetricCard icon={Banknote} label="Saldo Kas" value={formatCurrency(dashboard.cashBalance)} tone="green" />
            <MetricCard icon={Landmark} label="Saldo Bank" value={formatCurrency(dashboard.bankBalance)} tone="blue" />
            <MetricCard icon={ArrowDownLeft} label="Mutasi Masuk" value={formatNumber(dashboard.incoming)} detail="Qty posted" tone="purple" />
            <MetricCard icon={ArrowUpRight} label="Mutasi Keluar" value={formatNumber(dashboard.outgoing)} detail="Qty posted" tone="amber" />
            <MetricCard icon={Scale} label="Selisih Rekonsiliasi" value={formatCurrency(data.reconciliationDifference || 0)} detail="Menunggu modul rekonsiliasi" tone="slate" />
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-2 flex items-center justify-between">
              <div><h2 className="font-semibold">Aktivitas Terbaru</h2><p className="text-xs text-muted-foreground">Transaksi terbaru pada {scopeLabel}</p></div>
              <Store className="h-5 w-5 text-muted-foreground" />
            </div>
            {dashboard.activities.length ? dashboard.activities.map((item, index) => <ActivityItem key={`${item.kind}-${item.id || index}`} item={item} />) : <div className="py-10 text-center text-sm text-muted-foreground">Belum ada aktivitas pada cabang ini.</div>}
          </div>
        </>
      )}
    </div>
  );
}
