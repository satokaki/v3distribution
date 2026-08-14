import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, CheckCircle2, FileBarChart, PackageSearch, ReceiptText, Users } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";

const localDate = (value = null) => value instanceof Date
  ? value.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
  : String(value || "").slice(0, 10);
const sum = (items, getter) => items.reduce((total, item) => total + (getter(item) || 0), 0);
const outstanding = (item) => Math.max(0, (item.amount || 0) - (item.paid_amount || 0));
const pct = (current, previous) => previous ? ((current - previous) / previous) * 100 : current ? 100 : 0;
const SHORTCUTS = [
  { label: "Laporan Konsolidasi", path: "/laporan", icon: FileBarChart },
  { label: "Master Produk", path: "/master/barang", icon: PackageSearch },
  { label: "Master Harga", path: "/pricing", icon: ReceiptText },
  { label: "Master Cabang", path: "/master/cabang", icon: Building2 },
  { label: "Approval", path: "/system", icon: CheckCircle2 },
  { label: "CRM V3 Pro", path: "/integrasi-crm", icon: Users },
];

function Section({ number, title, children, action = null }) {
  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white shadow-sm">{number}</span><h2 className="font-semibold text-emerald-950">{title}</h2></div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, note = "", alert = false }) {
  const tone = /Piutang|Tempo|Hutang|Overdue|Jatuh Tempo/i.test(label)
    ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
    : /Stok|Inventory|Persediaan|Produk/i.test(label)
      ? "border-blue-200 bg-gradient-to-br from-blue-50 to-white"
      : /Bank|Kas|Cash|Likuiditas|Penjualan/i.test(label)
        ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
        : "border-violet-200 bg-gradient-to-br from-violet-50 to-white";
  return <div className={`rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm ${alert ? "border-red-200 bg-gradient-to-br from-red-50 to-white" : tone}`}><div className="text-xs font-medium text-muted-foreground">{label}</div><div className={`mt-1 text-lg font-bold ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</div>{note && <div className="mt-1 text-[11px] text-muted-foreground">{note}</div>}</div>;
}

function Pending({ label }) {
  return <div className="flex items-center justify-between rounded-lg border border-dashed border-emerald-200 bg-emerald-50/40 p-3 text-sm"><span>{label}</span><span className="text-xs text-emerald-700">Belum terhubung</span></div>;
}

export default function HeadOfficeDashboard({ data, loading, error }) {
  const report = useMemo(() => {
    const today = localDate();
    const month = today.slice(0, 7);
    const previousMonthDate = new Date(`${month}-01T00:00:00`);
    previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
    const previousMonth = localDate(previousMonthDate).slice(0, 7);
    const postedSales = data.sales.filter((item) => item.status === "posted");
    const currentSales = postedSales.filter((item) => localDate(item.date).startsWith(month));
    const previousSales = postedSales.filter((item) => localDate(item.date).startsWith(previousMonth));
    const openReceivables = data.receivables.filter((item) => item.status !== "paid");
    const openPayables = data.payables.filter((item) => item.status !== "paid");
    const overdue = openReceivables.filter((item) => item.due_date && localDate(item.due_date) < today);
    const dueToday = openReceivables.filter((item) => localDate(item.due_date) === today);
    const productMap = Object.fromEntries(data.products.map((item) => [item.id, item]));
    const branchMap = Object.fromEntries(data.branches.map((item) => [item.id, item]));
    const accountMap = Object.fromEntries(data.accounts.map((item) => [item.id, item]));
    const inventoryValue = (stock) => sum(stock, (item) => (item.quantity || 0) * (productMap[item.product_id]?.purchase_price || 0));
    const saleMargin = (sale) => (sale.total || 0) - sum(sale.items || [], (item) => (item.qty || 0) * (productMap[item.product_id]?.purchase_price || 0));
    const branchRows = data.branches.map((branch) => {
      const current = currentSales.filter((item) => item.branch_id === branch.id);
      const previous = previousSales.filter((item) => item.branch_id === branch.id);
      const revenue = sum(current, (item) => item.total);
      const cash = sum(current.filter((item) => item.payment_method !== "kredit"), (item) => item.total);
      const credit = sum(current.filter((item) => item.payment_method === "kredit"), (item) => item.total);
      return { id: branch.id, code: branch.code, name: branch.name, revenue, growth: pct(revenue, sum(previous, (item) => item.total)), cash, credit, margin: sum(current, saleMargin), receivable: sum(openReceivables.filter((item) => item.branch_id === branch.id), outstanding) };
    }).sort((a, b) => b.revenue - a.revenue).map((item, index) => ({ ...item, rank: index + 1 }));
    const aging = { current: 0, d30: 0, d60: 0, d90: 0 };
    openReceivables.forEach((item) => {
      const age = item.due_date ? Math.floor((new Date(today).getTime() - new Date(localDate(item.due_date)).getTime()) / 86400000) : 0;
      const value = outstanding(item);
      if (age <= 0) aging.current += value; else if (age <= 30) aging.d30 += value; else if (age <= 60) aging.d60 += value; else aging.d90 += value;
    });
    const groupSum = (items, key, valueFn) => Object.values(items.reduce((acc, item) => { const id = item[key] || "unknown"; acc[id] ||= { id, name: item.customer_name || item.salesperson_name || "Tanpa nama", value: 0 }; acc[id].value += valueFn(item); return acc; }, {})).sort((a, b) => b.value - a.value);
    const topCustomers = groupSum(postedSales, "customer_id", (item) => item.total || 0).slice(0, 5);
    const topReceivables = groupSum(openReceivables, "customer_id", outstanding).slice(0, 5);
    const salespersonRows = groupSum(currentSales, "salesperson_id", (item) => item.total || 0).filter((item) => item.id !== "unknown").slice(0, 8);
    const recent30 = new Date(); recent30.setDate(recent30.getDate() - 30);
    const recent90 = new Date(); recent90.setDate(recent90.getDate() - 90);
    const sold30 = new Set(postedSales.filter((sale) => new Date(localDate(sale.date)) >= recent30).flatMap((sale) => (sale.items || []).map((item) => item.product_id)));
    const sold90 = new Set(postedSales.filter((sale) => new Date(localDate(sale.date)) >= recent90).flatMap((sale) => (sale.items || []).map((item) => item.product_id)));
    const stockedProducts = new Set(data.stock.filter((item) => (item.quantity || 0) > 0).map((item) => item.product_id));
    const stockByBranch = data.branches.map((branch) => ({ id: branch.id, name: branch.name, value: inventoryValue(data.stock.filter((item) => item.branch_id === branch.id)) })).sort((a, b) => b.value - a.value);
    const cashTransactions = data.cashTransactions;
    const accountTransactions = (type, direction) => cashTransactions.filter((item) => accountMap[item.account_id]?.account_type === type && item.type === direction);
    return {
      today, month, postedSales, currentSales, branchRows, aging, topCustomers, topReceivables, salespersonRows, stockByBranch,
      salesToday: sum(postedSales.filter((item) => localDate(item.date) === today), (item) => item.total),
      salesMonth: sum(currentSales, (item) => item.total), cashSales: sum(currentSales.filter((item) => item.payment_method !== "kredit"), (item) => item.total), creditSales: sum(currentSales.filter((item) => item.payment_method === "kredit"), (item) => item.total),
      receivable: sum(openReceivables, outstanding), payable: sum(openPayables, outstanding), inventory: inventoryValue(data.stock), liquidity: sum(data.accounts, (item) => item.current_balance),
      dueToday: sum(dueToday, outstanding), overdue: sum(overdue, outstanding), overdueCount: overdue.length,
      lowStock: data.stock.filter((item) => (item.quantity || 0) <= (item.min_stock || 0)).length,
      overstock: data.stock.filter((item) => (item.quantity || 0) > Math.max((item.min_stock || 0) * 3, 50)).length,
      slowMoving: [...stockedProducts].filter((id) => !sold30.has(id) && sold90.has(id)).length,
      deadStock: [...stockedProducts].filter((id) => !sold90.has(id)).length,
      transferDraft: data.stockTransfers.filter((item) => item.status === "draft").length,
      cashBalance: sum(data.accounts.filter((item) => item.account_type === "kas"), (item) => item.current_balance), bankBalance: sum(data.accounts.filter((item) => item.account_type === "bank"), (item) => item.current_balance),
      cashIn: sum(accountTransactions("kas", "in"), (item) => item.amount), cashOut: sum(accountTransactions("kas", "out"), (item) => item.amount), bankIn: sum(accountTransactions("bank", "in"), (item) => item.amount), bankOut: sum(accountTransactions("bank", "out"), (item) => item.amount),
      activeCustomers: data.customers.filter((item) => item.is_active !== false).length, inactiveCustomers: data.customers.filter((item) => item.is_active === false).length, newCustomers: data.customers.filter((item) => localDate(item.created_date).startsWith(month)).length,
      crmCustomers: data.customers.filter((item) => item.sync_enabled).length,
      topReceivableBranch: branchRows.slice().sort((a, b) => b.receivable - a.receivable)[0], branchMap,
    };
  }, [data]);

  if (loading) return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 12 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div>;

  return (
    <div className="space-y-6 rounded-3xl bg-gradient-to-b from-emerald-50/70 via-white to-white p-1">
      <div className="rounded-2xl bg-gradient-to-r from-emerald-700 to-green-500 px-6 py-5 text-white shadow-sm"><h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Dashboard Pusat / Head Office</h1><p className="mt-1 text-sm text-emerald-50">Konsolidasi seluruh cabang · {report.today}</p></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <Section number="1" title="Ringkasan Bisnis"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Tile label="Penjualan Hari Ini" value={formatCurrency(report.salesToday)} /><Tile label="Penjualan Bulan Ini" value={formatCurrency(report.salesMonth)} /><Tile label="Total Cash" value={formatCurrency(report.cashSales)} /><Tile label="Total Tempo" value={formatCurrency(report.creditSales)} /><Tile label="Total Piutang" value={formatCurrency(report.receivable)} /><Tile label="Hutang Supplier" value={formatCurrency(report.payable)} /><Tile label="Nilai Persediaan" value={formatCurrency(report.inventory)} /><Tile label="Total Kas + Bank" value={formatCurrency(report.liquidity)} /></div></Section>

      <Section number="2" title="Performa Cabang"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Rank</th><th className="p-2">Cabang</th><th className="p-2 text-right">Penjualan</th><th className="p-2 text-right">Growth</th><th className="p-2 text-right">Cash / Tempo</th><th className="p-2 text-right">Margin</th><th className="p-2 text-right">Piutang</th></tr></thead><tbody>{report.branchRows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="p-2 font-bold">#{row.rank}</td><td className="p-2 font-medium">{row.code} · {row.name}</td><td className="p-2 text-right">{formatCurrency(row.revenue)}</td><td className={`p-2 text-right ${row.growth < 0 ? "text-red-600" : "text-emerald-600"}`}>{row.growth.toFixed(1)}%</td><td className="p-2 text-right">{formatCurrency(row.cash)} / {formatCurrency(row.credit)}</td><td className="p-2 text-right">{formatCurrency(row.margin)}</td><td className="p-2 text-right">{formatCurrency(row.receivable)}</td></tr>)}</tbody></table></div></Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section number="3" title="Piutang"><div className="grid grid-cols-2 gap-3"><Tile label="Piutang Berjalan" value={formatCurrency(report.receivable)} /><Tile label="Jatuh Tempo Hari Ini" value={formatCurrency(report.dueToday)} /><Tile label="Overdue" value={formatCurrency(report.overdue)} note={`${report.overdueCount} tagihan`} alert={report.overdueCount > 0} /><Tile label="Cabang Piutang Tertinggi" value={report.topReceivableBranch?.name || "—"} note={formatCurrency(report.topReceivableBranch?.receivable || 0)} /></div><div className="mt-4 grid grid-cols-4 gap-2"><Tile label="Belum JT" value={formatCurrency(report.aging.current)} /><Tile label="1–30 hari" value={formatCurrency(report.aging.d30)} /><Tile label="31–60 hari" value={formatCurrency(report.aging.d60)} /><Tile label=">60 hari" value={formatCurrency(report.aging.d90)} /></div><div className="mt-4"><div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Top Piutang Customer</div>{report.topReceivables.map((item) => <div key={item.id} className="flex justify-between border-b py-2 text-sm"><span>{item.name}</span><strong>{formatCurrency(item.value)}</strong></div>)}</div></Section>
        <Section number="4" title="Inventory"><div className="grid grid-cols-2 gap-3"><Tile label="Nilai Stok Total" value={formatCurrency(report.inventory)} /><Tile label="Stok Menipis" value={formatNumber(report.lowStock)} alert={report.lowStock > 0} /><Tile label="Produk Overstock" value={formatNumber(report.overstock)} note="> 3× minimum atau 50 unit" /><Tile label="Slow Moving" value={formatNumber(report.slowMoving)} note="Tidak terjual 30 hari" /><Tile label="Dead Stock" value={formatNumber(report.deadStock)} note="Tidak terjual 90 hari" /><Pending label="Selisih Stock Opname" /></div><div className="mt-4"><div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Nilai Stok Per Cabang</div>{report.stockByBranch.slice(0, 6).map((item) => <div key={item.id} className="flex justify-between border-b py-2 text-sm"><span>{item.name}</span><strong>{formatCurrency(item.value)}</strong></div>)}</div></Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section number="5" title="Mutasi Cabang"><div className="grid grid-cols-2 gap-3"><Tile label="Dalam Perjalanan" value={formatNumber(report.transferDraft)} note="Draft / belum posted" /><Tile label="Belum Diterima" value={formatNumber(report.transferDraft)} note="Status penerimaan belum tersedia" /><Pending label="Mutasi Selisih" /><Pending label="Riwayat Mutasi Bermasalah" /></div></Section>
        <Section number="6" title="Kas & Bank"><div className="grid grid-cols-2 gap-3"><Tile label="Saldo Kas Semua Cabang" value={formatCurrency(report.cashBalance)} /><Tile label="Saldo Bank" value={formatCurrency(report.bankBalance)} /><Tile label="Kas Masuk / Keluar" value={`${formatCurrency(report.cashIn)} / ${formatCurrency(report.cashOut)}`} /><Tile label="Bank Masuk / Keluar" value={`${formatCurrency(report.bankIn)} / ${formatCurrency(report.bankOut)}`} /><Tile label="Posisi Likuiditas" value={formatCurrency(report.liquidity)} /></div></Section>
      </div>

      <Section number="7" title="Rekonsiliasi"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Pending label="Cabang Sudah Closing" /><Pending label="Cabang Belum Closing" /><Pending label="Selisih Kas" /><Pending label="Selisih Bank" /><Pending label="Rekonsiliasi Bermasalah" /></div></Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section number="8" title="Sales Performance"><div className="space-y-2">{report.salespersonRows.map((item, index) => <div key={item.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span><strong>#{index + 1}</strong> · {item.name}</span><strong>{formatCurrency(item.value)}</strong></div>)}{report.salespersonRows.length === 0 && <div className="text-sm text-muted-foreground">Belum ada transaksi sales bulan ini.</div>}<Pending label="Target vs Actual" /><Pending label="Sales Turun Performa" /></div></Section>
        <Section number="9" title="Customer"><div className="grid grid-cols-2 gap-3"><Tile label="Customer Aktif" value={formatNumber(report.activeCustomers)} /><Tile label="Customer Tidak Aktif" value={formatNumber(report.inactiveCustomers)} /><Tile label="New Customer" value={formatNumber(report.newCustomers)} /><Tile label="Customer Overdue" value={formatNumber(report.overdueCount)} alert={report.overdueCount > 0} /><Tile label="Data CRM V3 Pro" value={formatNumber(report.crmCustomers)} note="Sync enabled" /></div><div className="mt-4"><div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Top Customer</div>{report.topCustomers.map((item) => <div key={item.id} className="flex justify-between border-b py-2 text-sm"><span>{item.name}</span><strong>{formatCurrency(item.value)}</strong></div>)}</div></Section>
      </div>

      <Section number="10" title="Alert & Exception"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Tile label="Piutang Overdue" value={formatNumber(report.overdueCount)} alert={report.overdueCount > 0} /><Tile label="Stok Kritis" value={formatNumber(report.lowStock)} alert={report.lowStock > 0} /><Pending label="Selisih Rekonsiliasi" /><Pending label="Mutasi Terlambat" /><Pending label="Transaksi Void Besar" /><Pending label="Diskon Tidak Wajar" /><Pending label="Aktivitas User Tidak Normal" /></div></Section>

      <Section number="11" title="Shortcut Pusat"><div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{SHORTCUTS.map(({ label, path, icon: Icon }) => <Link key={path} to={path} className="group flex items-center justify-between rounded-xl border border-border p-3 text-sm font-medium hover:border-primary hover:bg-primary/5"><span className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{label}</span><ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" /></Link>)}</div></Section>
    </div>
  );
}
