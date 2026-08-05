import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useBranchContext } from "@/lib/BranchContext";
import PageHeader from "@/components/PageHeader";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, Wallet, Package, Receipt, Coins, BarChart3 } from "lucide-react";

const inputCls = "px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";
const TABS = [
  { key: "ringkasan", label: "Ringkasan", icon: BarChart3 },
  { key: "penjualan", label: "Penjualan", icon: TrendingUp },
  { key: "pembelian", label: "Pembelian", icon: TrendingDown },
  { key: "stok", label: "Stok", icon: Package },
  { key: "kas", label: "Arus Kas", icon: Wallet },
  { key: "labarugi", label: "Laba Rugi", icon: Coins },
];

function inRange(dateStr, from, to) {
  if (!dateStr) return true;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export default function Laporan() {
  const { accessibleBranches, isSuperAdmin } = useBranchContext();
  const [tab, setTab] = useState("ringkasan");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState({ sales: [], purchases: [], cash: [], stock: [], products: [], commissions: [], payables: [], receivables: [] });

  const allowedBranchIds = useMemo(() => {
    if (isSuperAdmin) return null;
    return accessibleBranches.map((b) => b.branch_id);
  }, [accessibleBranches, isSuperAdmin]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sales, purchases, cash, stock, products, commissions, payables, receivables] = await Promise.all([
        base44.entities.Sale.list("-date", 500),
        base44.entities.Purchase.list("-date", 500),
        base44.entities.CashTransaction.list("-date", 500),
        base44.entities.StockBalance.list("-created_date", 500),
        base44.entities.Product.list(),
        base44.entities.Commission.list("-date", 500),
        base44.entities.Payable.list("-date", 500),
        base44.entities.Receivable.list("-date", 500),
      ]);
      setRaw({ sales, purchases, cash, stock, products, commissions, payables, receivables });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const scope = (arr, bidField = "branch_id") => {
    let r = arr || [];
    if (allowedBranchIds) r = r.filter((x) => allowedBranchIds.includes(x[bidField]));
    if (branchId) r = r.filter((x) => x[bidField] === branchId);
    return r;
  };

  const salesR = useMemo(() => scope(raw.sales).filter((s) => s.status === "posted" && inRange(s.date, from, to)), [raw.sales, allowedBranchIds, branchId, from, to]);
  const purchasesR = useMemo(() => scope(raw.purchases).filter((s) => s.status === "posted" && inRange(s.date, from, to)), [raw.purchases, allowedBranchIds, branchId, from, to]);
  const cashR = useMemo(() => scope(raw.cash).filter((s) => inRange(s.date, from, to)), [raw.cash, allowedBranchIds, branchId, from, to]);
  const commissionsR = useMemo(() => scope(raw.commissions).filter((s) => inRange(s.date, from, to)), [raw.commissions, allowedBranchIds, branchId, from, to]);

  const totalPenjualan = salesR.reduce((s, x) => s + (x.total || 0), 0);
  const totalPembelian = purchasesR.reduce((s, x) => s + (x.total || 0), 0);
  const kasMasuk = cashR.filter((c) => c.type === "in").reduce((s, x) => s + (x.amount || 0), 0);
  const kasKeluar = cashR.filter((c) => c.type === "out").reduce((s, x) => s + (x.amount || 0), 0);
  const komisiAccrued = commissionsR.filter((c) => c.status === "accrued").reduce((s, x) => s + (x.amount || 0), 0);
  const komisiPaid = commissionsR.filter((c) => c.status === "paid").reduce((s, x) => s + (x.amount || 0), 0);

  const productPrice = useMemo(() => new Map((raw.products || []).map((p) => [p.id, p.purchase_price || 0])), [raw.products]);
  const stockR = useMemo(() => scope(raw.stock, "branch_id"), [raw.stock, allowedBranchIds, branchId]);
  const stockValue = stockR.reduce((s, x) => s + (x.quantity || 0) * (productPrice.get(x.product_id) || 0), 0);

  const hutangSisa = scope(raw.payables).reduce((s, x) => s + ((x.amount || 0) - (x.paid_amount || 0)), 0);
  const piutangSisa = scope(raw.receivables).reduce((s, x) => s + ((x.amount || 0) - (x.paid_amount || 0)), 0);

  const branchesForFilter = accessibleBranches;

  const Card = ({ label, value, icon: Icon, tone }) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <Icon className={`w-4 h-4 ${tone || "text-muted-foreground"}`} />
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );

  const TableWrap = ({ children }) => (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {children}
        </table>
      </div>
    </div>
  );
  const Th = ({ children, right }) => <th className={`text-left font-semibold text-muted-foreground px-4 py-3 ${right ? "text-right" : ""}`}>{children}</th>;
  const Td = ({ children, right }) => <td className={`px-4 py-3 border-t border-border ${right ? "text-right" : ""}`}>{children}</td>;

  return (
    <div>
      <PageHeader title="Laporan" subtitle="Ringkasan operasional & keuangan" />

      <div className="flex flex-wrap items-end gap-2 mb-5">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Dari</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Sampai</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        {isSuperAdmin && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Cabang</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
              <option value="">Semua Cabang</option>
              {accessibleBranches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_code} · {b.branch_name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1 mb-5 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Memuat data...</div>
      ) : (
        <>
          {tab === "ringkasan" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Card label="Total Penjualan" value={formatCurrency(totalPenjualan)} icon={TrendingUp} tone="text-emerald-600" />
              <Card label="Total Pembelian" value={formatCurrency(totalPembelian)} icon={TrendingDown} tone="text-rose-600" />
              <Card label="Laba Kotor" value={formatCurrency(totalPenjualan - totalPembelian)} icon={Coins} tone="text-primary" />
              <Card label="Kas Masuk" value={formatCurrency(kasMasuk)} icon={Wallet} tone="text-emerald-600" />
              <Card label="Kas Keluar" value={formatCurrency(kasKeluar)} icon={Wallet} tone="text-rose-600" />
              <Card label="Net Arus Kas" value={formatCurrency(kasMasuk - kasKeluar)} icon={Wallet} />
              <Card label="Komisi Belum Dibayar" value={formatCurrency(komisiAccrued)} icon={Receipt} tone="text-amber-600" />
              <Card label="Nilai Stok" value={formatCurrency(stockValue)} icon={Package} />
              <Card label="Sisa Hutang" value={formatCurrency(hutangSisa)} icon={TrendingDown} tone="text-rose-600" />
              <Card label="Sisa Piutang" value={formatCurrency(piutangSisa)} icon={TrendingUp} tone="text-emerald-600" />
            </div>
          )}

          {tab === "penjualan" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Card label="Transaksi" value={salesR.length} icon={Receipt} />
                <Card label="Total" value={formatCurrency(totalPenjualan)} icon={TrendingUp} tone="text-emerald-600" />
                <Card label="Rata-rata" value={formatCurrency(salesR.length ? totalPenjualan / salesR.length : 0)} icon={BarChart3} />
              </div>
              <TableWrap>
                <thead><tr><Th>Kode</Th><Th>Tanggal</Th><Th>Pelanggan</Th><Th>Sales</Th><Th right>Total</Th></tr></thead>
                <tbody>
                  {salesR.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Tidak ada data</td></tr> :
                    salesR.map((s) => (
                      <tr key={s.id} className="hover:bg-accent/30">
                        <Td>{s.code}</Td><Td>{(s.date || "").slice(0, 10)}</Td><Td>{s.customer_name || "—"}</Td><Td>{s.salesperson_name || "—"}</Td><Td right>{formatCurrency(s.total || 0)}</Td>
                      </tr>
                    ))}
                </tbody>
              </TableWrap>
            </div>
          )}

          {tab === "pembelian" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Card label="Transaksi" value={purchasesR.length} icon={Receipt} />
                <Card label="Total" value={formatCurrency(totalPembelian)} icon={TrendingDown} tone="text-rose-600" />
                <Card label="Rata-rata" value={formatCurrency(purchasesR.length ? totalPembelian / purchasesR.length : 0)} icon={BarChart3} />
              </div>
              <TableWrap>
                <thead><tr><Th>Kode</Th><Th>Tanggal</Th><Th>Supplier</Th><Th right>Total</Th></tr></thead>
                <tbody>
                  {purchasesR.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Tidak ada data</td></tr> :
                    purchasesR.map((s) => (
                      <tr key={s.id} className="hover:bg-accent/30">
                        <Td>{s.code}</Td><Td>{(s.date || "").slice(0, 10)}</Td><Td>{s.supplier_name || "—"}</Td><Td right>{formatCurrency(s.total || 0)}</Td>
                      </tr>
                    ))}
                </tbody>
              </TableWrap>
            </div>
          )}

          {tab === "stok" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Card label="Item Stok" value={stockR.length} icon={Package} />
                <Card label="Total Qty" value={stockR.reduce((s, x) => s + (x.quantity || 0), 0)} icon={Package} />
                <Card label="Nilai Stok" value={formatCurrency(stockValue)} icon={Coins} tone="text-primary" />
              </div>
              <TableWrap>
                <thead><tr><Th>SKU</Th><Th>Produk</Th><Th>Cabang</Th><Th>Gudang</Th><Th right>Qty</Th><Th right>HPP</Th><Th right>Nilai</Th></tr></thead>
                <tbody>
                  {stockR.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Tidak ada data</td></tr> :
                    stockR.map((s) => (
                      <tr key={s.id} className="hover:bg-accent/30">
                        <Td>{s.sku || "—"}</Td><Td>{s.product_name || "—"}</Td><Td>{s.branch_code || "—"}</Td><Td>{s.warehouse_name || "—"}</Td>
                        <Td right>{s.quantity || 0}</Td><Td right>{formatCurrency(productPrice.get(s.product_id) || 0)}</Td><Td right>{formatCurrency((s.quantity || 0) * (productPrice.get(s.product_id) || 0))}</Td>
                      </tr>
                    ))}
                </tbody>
              </TableWrap>
            </div>
          )}

          {tab === "kas" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card label="Kas Masuk" value={formatCurrency(kasMasuk)} icon={TrendingUp} tone="text-emerald-600" />
                <Card label="Kas Keluar" value={formatCurrency(kasKeluar)} icon={TrendingDown} tone="text-rose-600" />
                <Card label="Net" value={formatCurrency(kasMasuk - kasKeluar)} icon={Wallet} />
              </div>
              <TableWrap>
                <thead><tr><Th>Kode</Th><Th>Tanggal</Th><Th>Rekening</Th><Th>Kategori</Th><Th>Keterangan</Th><Th right>Jumlah</Th></tr></thead>
                <tbody>
                  {cashR.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Tidak ada data</td></tr> :
                    cashR.map((s) => (
                      <tr key={s.id} className="hover:bg-accent/30">
                        <Td>{s.code}</Td><Td>{(s.date || "").slice(0, 10)}</Td><Td>{s.account_name || "—"}</Td><Td>{s.category || "—"}</Td><Td>{s.description || "—"}</Td>
                        <Td right><span className={s.type === "in" ? "text-emerald-600" : "text-rose-600"}>{s.type === "in" ? "+" : "-"}{formatCurrency(s.amount || 0)}</span></Td>
                      </tr>
                    ))}
                </tbody>
              </TableWrap>
            </div>
          )}

          {tab === "labarugi" && (
            <div className="max-w-xl space-y-1">
              <div className="flex justify-between px-4 py-3 rounded-lg bg-emerald-50"><span className="font-medium">Pendapatan (Penjualan)</span><span className="font-bold text-emerald-700">{formatCurrency(totalPenjualan)}</span></div>
              <div className="flex justify-between px-4 py-3 rounded-lg bg-rose-50"><span className="font-medium">HPP (Pembelian)</span><span className="font-bold text-rose-700">- {formatCurrency(totalPembelian)}</span></div>
              <div className="flex justify-between px-4 py-3 rounded-lg bg-muted/40"><span className="font-medium">Laba Kotor</span><span className="font-bold">{formatCurrency(totalPenjualan - totalPembelian)}</span></div>
              <div className="flex justify-between px-4 py-3 rounded-lg bg-rose-50"><span className="font-medium">Beban Komisi (dibayar)</span><span className="font-bold text-rose-700">- {formatCurrency(komisiPaid)}</span></div>
              <div className="flex justify-between px-4 py-3 rounded-lg bg-primary/10 border-t border-border mt-1"><span className="font-semibold">Laba Bersih</span><span className="font-bold text-primary">{formatCurrency(totalPenjualan - totalPembelian - komisiPaid)}</span></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}