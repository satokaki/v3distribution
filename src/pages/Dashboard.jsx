import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { formatCurrency } from "@/lib/utils";
import {
  Store,
  Package,
  Users,
  Truck,
  Wallet,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
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

export default function Dashboard() {
  const [stats, setStats] = useState({
    branches: 0,
    products: 0,
    customers: 0,
    suppliers: 0,
    salespersons: 0,
    accounts: 0,
    totalBalance: 0,
  });
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [b, p, c, s, sp, a] = await Promise.all([
          base44.entities.Branch.list(),
          base44.entities.Product.list(),
          base44.entities.Customer.list(),
          base44.entities.Supplier.list(),
          base44.entities.Salesperson.list(),
          base44.entities.Account.list(),
        ]);
        setBranches(b || []);
        setStats({
          branches: b?.length || 0,
          products: p?.length || 0,
          customers: c?.length || 0,
          suppliers: s?.length || 0,
          salespersons: sp?.length || 0,
          accounts: a?.length || 0,
          totalBalance: (a || []).reduce((sum, acc) => sum + (acc.current_balance || 0), 0),
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Ringkasan operasional seluruh cabang</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Store} label="Total Cabang" value={stats.branches} accent="primary" />
        <StatCard icon={Package} label="Total Barang" value={stats.products} accent="blue" />
        <StatCard icon={Users} label="Total Pelanggan" value={stats.customers} accent="green" />
        <StatCard icon={Wallet} label="Saldo Kas & Bank" value={formatCurrency(stats.totalBalance)} accent="purple" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Truck} label="Total Supplier" value={stats.suppliers} accent="amber" />
        <StatCard icon={TrendingUp} label="Total Sales" value={stats.salespersons} accent="primary" />
        <StatCard icon={Wallet} label="Total Rekening" value={stats.accounts} accent="blue" />
        <StatCard icon={ArrowUpRight} label="Penjualan Hari Ini" value="—" accent="green" sub="Coming soon" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold mb-4">Cabang Aktif</h3>
          {loading ? (
            <div className="text-sm text-muted-foreground">Memuat...</div>
          ) : branches.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Belum ada cabang. Tambahkan di menu Master Data.</div>
          ) : (
            <div className="space-y-2">
              {branches.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${b.branch_type === "pusat" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {b.code?.slice(0, 3)}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{b.name}</div>
                      <div className="text-xs text-muted-foreground">{b.person_in_charge || "—"}</div>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${b.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {b.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold mb-4">Status Implementasi</h3>
          <div className="space-y-3">
            {[
              { label: "Master Data & Cabang", done: true },
              { label: "Stok & Kartu Stok", done: false },
              { label: "Pembelian & Penjualan", done: false },
              { label: "Mutasi & Jual Beli Cabang", done: false },
              { label: "Hutang, Piutang & Buku Kas", done: false },
              { label: "Komisi & Laporan", done: false },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${item.done ? "bg-green-500" : "bg-amber-400"}`} />
                  <span className="text-sm">{item.label}</span>
                </div>
                <span className={`text-xs ${item.done ? "text-green-600" : "text-amber-600"}`}>
                  {item.done ? "Siap" : "Fase berikutnya"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <strong>Fase 1 (Fondasi) aktif.</strong> Master data cabang, gudang, kategori, barang, pelanggan, supplier, sales, dan rekening siap digunakan dengan auto-generate kode.
          Fase berikutnya (stok, transaksi, multi-cabang, keuangan, komisi, laporan) akan dibangun bertahap.
        </div>
      </div>
    </div>
  );
}