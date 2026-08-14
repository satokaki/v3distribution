import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import { resolveBranchBalanceRows } from "@/lib/branchStockBalanceCore";
import { fetchBranchProductBalances, fetchBranchProductLedger } from "@/lib/branchStockLedger";
import { aggregateStockSummary, buildBranchStockReadModel, buildStockCardExport } from "@/lib/branchStockLedgerCore";
import { AlertTriangle, Boxes, CheckCircle2, Download, FileDown, Inbox, Search, TrendingDown, TrendingUp } from "lucide-react";

const TABS = ["Semua", "Liquid", "Device", "Cartridge", "Aksesoris"];
const TYPE_LABEL = {
  in: "Pembelian", purchase: "Pembelian", out: "Penjualan", sale: "Penjualan",
  sale_return: "Retur Penjualan", purchase_return: "Retur Pembelian",
  adjustment: "Penyesuaian Stok", stock_adjustment: "Penyesuaian Stok",
  opening_balance: "Saldo Awal", transfer_in: "Mutasi Masuk", transfer_out: "Mutasi Keluar",
  opname_in: "Stock Opname +", opname_out: "Stock Opname -",
};
const inputClass = "h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const jakartaDay = (date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const formatDateTime = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) : "—";
const normalizeType = (product) => `${product.product_type || ""} ${product.category_name || ""} ${product.subcategory || ""}`.toLowerCase();

function Metric({ icon: Icon, label, value, tone }) {
  const tones = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700" };
  return <div className={`rounded-xl p-4 ${tones[tone]}`}><div className="flex items-center gap-2 text-xs font-semibold"><Icon className="h-4 w-4" />{label}</div><div className="mt-2 text-xl font-bold">{value}</div></div>;
}

export default function StockCard() {
  const { toast } = useToast();
  const { activeBranchId, activeBranch, accessibleBranches, isSuperAdmin, isAllBranches } = useBranchContext();
  const today = jakartaDay(new Date());
  const initialStart = new Date(); initialStart.setDate(initialStart.getDate() - 14);
  const initialDateFrom = jakartaDay(initialStart);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(today);
  const [filterFrom, setFilterFrom] = useState(initialDateFrom);
  const [filterTo, setFilterTo] = useState(today);
  const [activeTab, setActiveTab] = useState("Semua");
  const [branchId, setBranchId] = useState(isAllBranches ? "" : activeBranchId);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [balanceRows, setBalanceRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) setBranchId(activeBranchId || "");
    else setBranchId(isAllBranches ? "" : activeBranchId || "");
  }, [activeBranchId, isAllBranches, isSuperAdmin]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([isSuperAdmin ? base44.entities.Branch.list("name", 500) : Promise.resolve([]), base44.entities.Product.list("name", 5000)])
      .then(([branchRows, productRows]) => { if (!cancelled) { setBranches(branchRows || []); setProducts((productRows || []).filter((row) => row.is_active !== false)); } })
      .catch((error) => toast({ title: "Gagal memuat master kartu stok", description: error.message, variant: "destructive" }));
    return () => { cancelled = true; };
  }, [isSuperAdmin, toast]);

  const filteredProducts = useMemo(() => products.filter((product) => {
    const classification = normalizeType(product);
    const tabMatch = activeTab === "Semua" || (activeTab === "Cartridge" ? classification.includes("cartridge") || classification.includes("catridge") : classification.includes(activeTab.toLowerCase()));
    const haystack = `${product.sku || ""} ${product.name || ""} ${product.brand || ""}`.toLowerCase();
    return tabMatch && (!productSearch || haystack.includes(productSearch.toLowerCase()));
  }), [activeTab, productSearch, products]);

  useEffect(() => { if (productId && !products.some((product) => product.id === productId)) setProductId(""); }, [productId, products]);
  useEffect(() => { setProductId(""); }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!productId || (!isSuperAdmin && !activeBranchId)) { setLedgerRows([]); setBalanceRows([]); return; }
      const scopeBranchId = isSuperAdmin ? branchId : activeBranchId;
      setLoading(true);
      try {
        const [ledger, balances] = await Promise.all([
          fetchBranchProductLedger({ branchId: scopeBranchId, productId }),
          fetchBranchProductBalances({ branchId: scopeBranchId, productId }),
        ]);
        if (!cancelled) { setLedgerRows(ledger); setBalanceRows(balances); }
      } catch (error) {
        if (!cancelled) toast({ title: "Gagal memuat kartu stok", description: error.message, variant: "destructive" });
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [activeBranchId, branchId, isSuperAdmin, productId, toast]);

  const selectedProduct = products.find((product) => product.id === productId);
  const branchNames = useMemo(() => new Map((isSuperAdmin ? branches : accessibleBranches).map((branch) => [branch.id || branch.branch_id, branch.name || branch.branch_name || branch.branch_code])), [accessibleBranches, branches, isSuperAdmin]);
  const resolvedBalances = useMemo(() => {
    const groups = new Map();
    for (const row of balanceRows) groups.set(row.branch_id, [...(groups.get(row.branch_id) || []), row]);
    return new Map([...groups].map(([id, rows]) => [id, resolveBranchBalanceRows(rows).quantity]));
  }, [balanceRows]);
  const latestPeriod = !dateTo || dateTo >= today;
  const model = useMemo(() => buildBranchStockReadModel({ ledgerRows, startDate: dateFrom, endDate: dateTo, resolvedBalances: latestPeriod ? resolvedBalances : new Map() }), [dateFrom, dateTo, latestPeriod, ledgerRows, resolvedBalances]);
  const summary = useMemo(() => aggregateStockSummary(model.summaries), [model.summaries]);
  const visibleRows = useMemo(() => model.timelines.filter((row) => !movementSearch || `${row.reference_number} ${row.transaction_type} ${row.user} ${row.note}`.toLowerCase().includes(movementSearch.toLowerCase())).slice().reverse(), [model.timelines, movementSearch]);
  const includeBranch = isSuperAdmin && !branchId;
  const branchLabel = includeBranch ? "Semua Cabang" : branchNames.get(branchId || activeBranchId) || activeBranch?.branch_name || "Cabang user";

  const exportCsv = () => {
    const matrix = buildStockCardExport({ rows: visibleRows, summary, product: selectedProduct, branchLabel, periodLabel: `${dateFrom || "Awal"} s.d. ${dateTo || "Sekarang"}`, includeBranch, branchNames, typeLabels: TYPE_LABEL });
    const csv = matrix.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `kartu-stok-${selectedProduct?.sku || "produk"}-${dateFrom}-${dateTo}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const applyPeriod = () => {
    if (filterFrom && filterTo && filterFrom > filterTo) {
      toast({ title: "Periode tidak valid", description: "Tanggal mulai tidak boleh setelah tanggal selesai.", variant: "destructive" });
      return;
    }
    setDateFrom(filterFrom);
    setDateTo(filterTo);
  };

  return <div className="space-y-5 print:p-0">
    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
      <div><h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Kartu Stok Detail</h1><p className="mt-1 text-sm text-muted-foreground">Timeline stok berdasarkan produk dan cabang</p></div>
      <div className="flex gap-2 print:hidden"><button onClick={exportCsv} disabled={!visibleRows.length} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button><button onClick={() => window.print()} disabled={!selectedProduct} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium disabled:opacity-50"><FileDown className="h-4 w-4" />Export PDF</button></div>
    </div>

    <section className="rounded-2xl border bg-card p-5 shadow-sm print:hidden">
      <div className="grid grid-cols-5 rounded-xl bg-muted p-1">{TABS.map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-lg px-2 py-2 text-sm font-semibold ${activeTab === tab ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{tab}</button>)}</div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {isSuperAdmin ? <label className="space-y-1.5"><span className="text-xs font-semibold">Cabang</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)} className={`${inputClass} w-full`}><option value="">Semua Cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label> : <div className="space-y-1.5"><span className="text-xs font-semibold">Cabang</span><div className={`${inputClass} flex w-full items-center bg-muted font-medium`}>{branchLabel}</div></div>}
        <label className="space-y-1.5"><span className="text-xs font-semibold">Cari Produk</span><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="SKU / Nama / Brand..." className={`${inputClass} w-full`} /></label>
        <label className="space-y-1.5"><span className="text-xs font-semibold">Produk</span><select value={productId} onChange={(event) => setProductId(event.target.value)} className={`${inputClass} w-full`}><option value="">— Pilih produk —</option>{filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label>
        <div className="space-y-1.5"><span className="text-xs font-semibold">Periode</span><div className="flex gap-2"><input type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} className={`${inputClass} min-w-0 flex-1`} /><input type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} className={`${inputClass} min-w-0 flex-1`} /></div></div>
        <div className="flex items-end"><button onClick={applyPeriod} className="h-10 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Terapkan</button></div>
      </div>
    </section>

    {selectedProduct && <div className="rounded-xl border bg-card px-4 py-3 text-sm"><strong>{selectedProduct.name}</strong><span className="mx-2 text-muted-foreground">·</span>{selectedProduct.sku}<span className="mx-2 text-muted-foreground">·</span>{branchLabel}<span className="mx-2 text-muted-foreground">·</span>{dateFrom} s.d. {dateTo}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Boxes} label="Saldo Awal" value={summary.opening_balance} tone="blue" /><Metric icon={TrendingUp} label="Total Masuk" value={summary.total_in} tone="green" /><Metric icon={TrendingDown} label="Total Keluar" value={summary.total_out} tone="red" /><Metric icon={Boxes} label="Saldo Akhir" value={summary.closing_balance} tone="amber" /></section>

    {latestPeriod && model.diagnostics.length > 0 && <section className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">Diagnostic Saldo Saat Ini</h2><div className="mt-3 grid gap-2 md:grid-cols-2">{model.diagnostics.map((item) => <div key={item.branch_id} className={`rounded-xl border p-3 text-sm ${item.status === "MATCH" ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}><div className="flex items-center gap-2 font-semibold">{item.status === "MATCH" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}{branchNames.get(item.branch_id) || item.branch_id}: {item.status}</div><div className="mt-1 text-xs text-muted-foreground">Historical Closing {item.historical_closing} · Resolved Balance {item.resolved_balance} · Difference {item.difference}</div></div>)}</div></section>}

    <section className="rounded-2xl border bg-card shadow-sm">
      <div className="border-b p-5"><h2 className="font-semibold">Pergerakan Stok</h2><div className="relative mt-4 max-w-lg print:hidden"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={movementSearch} onChange={(event) => setMovementSearch(event.target.value)} placeholder="Cari referensi / tipe / user / catatan..." className={`${inputClass} w-full pl-9`} /></div></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground"><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">No Referensi</th><th className="px-4 py-3">Jenis Transaksi</th>{includeBranch && <th className="px-4 py-3">Cabang</th>}<th className="px-4 py-3 text-right">Masuk</th><th className="px-4 py-3 text-right">Keluar</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Catatan</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={includeBranch ? 9 : 8} className="py-14 text-center text-muted-foreground">Memuat histori lengkap...</td></tr> : visibleRows.length === 0 ? <tr><td colSpan={includeBranch ? 9 : 8} className="py-14 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />Belum ada pergerakan stok.</td></tr> : visibleRows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.transaction_date)}</td><td className="px-4 py-3 font-mono text-xs">{row.reference_number || "—"}</td><td className="px-4 py-3">{TYPE_LABEL[row.transaction_type] || row.transaction_type}</td>{includeBranch && <td className="px-4 py-3">{branchNames.get(row.branch_id) || row.branch_code || row.branch_id}</td>}<td className="px-4 py-3 text-right font-semibold text-emerald-600">{row.qty_in || "—"}</td><td className="px-4 py-3 text-right font-semibold text-red-600">{row.qty_out || "—"}</td><td className="px-4 py-3 text-right font-bold">{row.running_balance}</td><td className="px-4 py-3">{row.user || "—"}</td><td className="max-w-xs px-4 py-3 text-muted-foreground">{row.note || "—"}</td></tr>)}
      </tbody></table></div>
    </section>

    {(model.duplicates.length > 0 || model.duplicateCandidates.length > 0) && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 print:hidden">Diagnostic: {model.duplicates.length} duplikat terbukti disembunyikan dari read model; {model.duplicateCandidates.length} kandidat serupa dipertahankan dan tidak dihapus.</div>}
  </div>;
}
