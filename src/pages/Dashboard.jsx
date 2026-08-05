import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useBranchContext } from "@/lib/BranchContext";
import {
  Store, Package, Users, Truck, Wallet, TrendingUp, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Boxes, ClipboardList,
} from "lucide-react";

function StatCard({ icon: Icon, label, value, sub, accent = "primary" }) {
  const accents = {
    primary: "bg-primary/10 text-primary",
    blue: "bg-blue-500/10 text-blue-600",
    green: "bg-green-500/10 text-green-600",
    amber: "bg-amber-500/10 text-amber-600",
    purple: "bg-purple-500/10 text-purple-600",
    red: "bg-red-500/10 text-red-600",
  };
  return (
    <div className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accents[accent]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

const todayLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

// scope a list to active branch. masterData uses owner_branch_id (shared items have no owner).
function scopeList(list, isAll, id, field, includeShared = false) {
  if (isAll) return list;
  return list.filter((r) => r[field] === id || (includeShared && !r[field]));
}

export default function Dashboard() {
  const { activeBranchId, isAllBranches, isSuperAdmin, accessibleBranches, activeBranch } = useBranchContext();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ branches: [], products: [], customers: [], suppliers: [], salespersons: [], accounts: [], stock: [], sales: [], purchases: [] });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [branches, products, customers, suppliers, salespersons, accounts, stock, sales, purchases] = await Promise.all([
          base44.entities.Branch.list("-created_date", 500),
          base44.entities.Product.list("-created_date", 500),
          base44.entities.Customer.list("-created_date", 500),
          base44.entities.Supplier.list("-created_date", 500),
          base44.entities.Salesperson.list("-created_date", 500),
          base44.entities.Account.list("-created_date", 500),
          base44.entities.StockBalance.list("-created_date", 500),
          base44.entities.Sale.list("-created_date", 500),
          base44.entities.Purchase.list("-created_date", 500),
        ]);
        if (!cancelled) setData({ branches: branches || [], products: products || [], customers: customers || [], suppliers: suppliers || [], salespersons: salespersons || [], accounts: accounts || [], stock: stock || [], sales: sales || [], purchases: purchases || [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeBranchId]);

  const stats = useMemo(() => {
    const today = todayLocal();
    const products = scopeList(data.products, isAllBranches, activeBranchId, "owner_branch_id", true);
    const customers = scopeList(data.customers, isAllBranches, activeBranchId, "owner_branch_id", true);
    const suppliers = scopeList(data.suppliers, isAllBranches, activeBranchId, "owner_branch_id", true);
    const salespersons = scopeList(data.salespersons, isAllBranches, activeBranchId, "branch_id");
    const accounts = scopeList(data.accounts, isAllBranches, activeBranchId, "branch_id");
    const stock = scopeList(data.stock, isAllBranches, activeBranchId, "branch_id");
    const sales = (data.sales).filter((s) => (isAllBranches || s.branch_id === activeBranchId) && s.status === "posted" && (s.date || "").slice(0, 10) === today);
    const purchases = (data.purchases).filter((p) => (isAllBranches || p.branch_id === activeBranchId) && p.status === "posted" && (p.date || "").slice(0, 10) === today);
    return {
      branches: isAllBranches ? data.branches.length : 1,
      products: products.length,
      customers: customers.length,
      suppliers: suppliers.length,
      salespersons: salespersons.length,
      accounts: accounts.length,
      totalBalance: accounts.reduce((s, a) => s + (a.current_balance || 0), 0),
      stockQty: stock.reduce((s, b) => s + (b.quantity || 0), 0),
      lowStock: stock.filter((b) => (b.quantity || 0) <= (b.min_stock || 0)).length,
      salesToday: sales.reduce((s, x) => s + (x.total || 0), 0),
      purchasesToday: purchases.reduce((s, x) => s + (x.total || 0), 0),
      salesCount: sales.length,
      purchasesCount: purchases.length,
    };
  }, [data, isAllBranches, activeBranchId]);

  // per-branch comparison (all mode)
  const perBranch = useMemo(() => {
    if (!isAllBranches) return [];
    const today = todayLocal();
    return data.branches.map((b) => {
      const stk = data.stock.filter((s) => s.branch_id === b.id).reduce((s, x) => s + (x.quantity || 0), 0);
      const bal = data.accounts.filter((a) => a.branch_id === b.id).reduce((s, a) => s + (a.current_balance || 0), 0);
      const salesToday = data.sales.filter((s) => s.branch_id === b.id && s.status === "posted" && (s.date || "").slice(0, 10) === today).reduce((s, x) => s + (x.total || 0), 0);
      return { id: b.id, name: b.name, code: b.code, type: b.branch_type, stock: stk, balance: bal, salesToday };
    });
  }, [data, isAllBranches]);

  const recent = useMemo(() => {
    if (isAllBranches) return [];
    const today = todayLocal();
    const s = data.sales.filter((x) => x.branch_id === activeBranchId).slice(0, 5).map((x) => ({ ...x, kind: "Penjualan" }));
    const p = data.purchases.filter((x) => x.branch_id === activeBranchId).slice(0, 5).map((x) => ({ ...x, kind: "Pembelian" }));
    return [...s, ...p].sort((a, b) => (b.created_date || "").localeCompare(a.created_date || "")).slice(0, 8);
  }, [data, isAllBranches, activeBranchId]);

  const scopeLabel = isAllBranches ? "Semua Cabang" : activeBranch?.branch_name || accessibleBranches.find((b) => b.branch_id === activeBranchId)?.branch_name || "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isSuperAdmin && isAllBranches ? "Ringkasan gabungan seluruh cabang" : `Ringkasan operasional cabang ${scopeLabel}`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Store} label={isAllBranches ? "Total Cabang" : "Cabang Aktif"} value={isAllBranches ? stats.branches : 1} accent="primary" />
        <StatCard icon={Package} label="Total Barang" value={formatNumber(stats.products)} accent="blue" />
        <StatCard icon={Users} label="Total Pelanggan" value={formatNumber(stats.customers)} accent="green" />
        <StatCard icon={Wallet} label="Saldo Kas & Bank" value={formatCurrency(stats.totalBalance)} accent="purple" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ArrowUpRight} label="Penjualan Hari Ini" value={formatCurrency(stats.salesToday)} sub={`${stats.salesCount} transaksi`} accent="green" />
        <StatCard icon={ArrowDownRight} label="Pembelian Hari Ini" value={formatCurrency(stats.purchasesToday)} sub={`${stats.purchasesCount} transaksi`} accent="amber" />
        <StatCard icon={Boxes} label="Total Stok" value={formatNumber(stats.stockQty)} accent="blue" />
        <StatCard icon={AlertTriangle} label="Stok Menipis" value={formatNumber(stats.lowStock)} accent={stats.lowStock > 0 ? "red" : "primary"} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Truck} label="Supplier" value={formatNumber(stats.suppliers)} accent="amber" />
        <StatCard icon={TrendingUp} label="Sales" value={formatNumber(stats.salespersons)} accent="primary" />
        <StatCard icon={Wallet} label="Rekening" value={formatNumber(stats.accounts)} accent="blue" />
        <StatCard icon={ClipboardList} label="Stok SKUs" value={formatNumber(isAllBranches ? data.stock.length : (data.stock.filter((s) => s.branch_id === activeBranchId).length))} accent="purple" />
      </div>

      {isAllBranches && perBranch.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold mb-4">Perbandingan Antar Cabang</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left font-semibold text-muted-foreground px-3 py-2.5">Cabang</th>
                  <th className="text-left font-semibold text-muted-foreground px-3 py-2.5">Jenis</th>
                  <th className="text-right font-semibold text-muted-foreground px-3 py-2.5">Stok</th>
                  <th className="text-right font-semibold text-muted-foreground px-3 py-2.5">Saldo Kas</th>
                  <th className="text-right font-semibold text-muted-foreground px-3 py-2.5">Penjualan Hari Ini</th>
                </tr>
              </thead>
              <tbody>
                {perBranch.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-semibold ${b.type === "pusat" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{b.code?.slice(0, 3)}</div>
                        <span className="font-medium">{b.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><span className="text-xs">{b.type === "pusat" ? "Pusat" : "Cabang"}</span></td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(b.stock)}</td>
                    <td className="px-3 py-2.5 text-right">{formatCurrency(b.balance)}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(b.salesToday)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isAllBranches && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold mb-4">Transaksi Terbaru — {scopeLabel}</h3>
          {loading ? (
            <div className="text-sm text-muted-foreground">Memuat...</div>
          ) : recent.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Belum ada transaksi pada cabang ini.</div>
          ) : (
            <div className="space-y-2">
              {recent.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.kind === "Penjualan" ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600"}`}>
                      {t.kind === "Penjualan" ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{t.code || "—"}</div>
                      <div className="text-xs text-muted-foreground">{t.kind} · {(t.date || "").slice(0, 10)} · {t.status}</div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{formatCurrency(t.total)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <strong>Filter cabang aktif sudah diterapkan di Dashboard.</strong> Statistik (stok, penjualan/pembelian hari ini, saldo kas) menyesuaikan cabang yang dipilih di header.
          Halaman transaksi & stok akan ikut terfilter pada langkah integrasi berikutnya (RLS).
        </div>
      </div>
    </div>
  );
}