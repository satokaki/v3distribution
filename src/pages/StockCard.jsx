import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import { Boxes, Download, FileDown, Inbox, Search, TrendingDown, TrendingUp, Warehouse } from "lucide-react";

const TABS = [
  { key: "device", label: "Device", aliases: ["device", "mod", "pod"] },
  { key: "cartridge", label: "Cartridge", aliases: ["cartridge", "catridge", "coil"] },
  { key: "liquid", label: "Liquid", aliases: ["liquid", "juice", "e-liquid"] },
  { key: "accessory", label: "Aksesoris", aliases: ["aksesoris", "accessory", "accessories"] },
];

const TYPE_LABEL = {
  in: "Barang Masuk", out: "Penjualan", transfer_in: "Mutasi Masuk",
  transfer_out: "Mutasi Keluar", opname_in: "Stock Opname +",
  opname_out: "Stock Opname −", adjustment: "Penyesuaian",
};

const inputClass = "h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const localDate = (date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const formatDateTime = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const isIncoming = (type) => ["in", "transfer_in", "opname_in"].includes(type);

function QuickMetric({ icon: Icon, label, value, tone }) {
  const tones = {
    blue: "bg-blue-50 text-blue-600", green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600", amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold">{value} <span className="text-xs font-normal text-muted-foreground">unit</span></div></div>
    </div>
  );
}

export default function StockCard() {
  const { toast } = useToast();
  const { activeBranchId, isSuperAdmin, isAllBranches } = useBranchContext();
  const end = localDate(new Date());
  const startDate = new Date(); startDate.setDate(startDate.getDate() - 14);
  const [dateFrom, setDateFrom] = useState(localDate(startDate));
  const [dateTo, setDateTo] = useState(end);
  const [activeTab, setActiveTab] = useState("device");
  const [branchId, setBranchId] = useState(isAllBranches ? "" : activeBranchId);
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSuperAdmin) setBranchId(activeBranchId);
  }, [activeBranchId, isSuperAdmin]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([base44.entities.Branch.list(), base44.entities.Product.list("name", 500)])
      .then(([branchRows, productRows]) => {
        if (cancelled) return;
        setBranches(branchRows || []);
        setProducts((productRows || []).filter((item) => item.is_active !== false));
      })
      .catch(() => toast({ title: "Gagal memuat master kartu stok", variant: "destructive" }));
    return () => { cancelled = true; };
  }, [toast]);

  useEffect(() => {
    if (!branchId) { setWarehouses([]); setWarehouseId(""); return; }
    base44.entities.Warehouse.filter({ branch_id: branchId, is_active: true }, "name", 500)
      .then((rows) => setWarehouses(rows || []))
      .catch(() => setWarehouses([]));
    setWarehouseId("");
  }, [branchId]);

  const tabProducts = useMemo(() => {
    const tab = TABS.find((item) => item.key === activeTab);
    return products.filter((product) => {
      const classification = `${product.product_type || ""} ${product.category_name || ""} ${product.subcategory || ""}`.toLowerCase();
      return tab.aliases.some((alias) => classification.includes(alias));
    });
  }, [products, activeTab]);

  useEffect(() => {
    if (!tabProducts.some((item) => item.id === productId)) setProductId(tabProducts[0]?.id || "");
  }, [tabProducts, productId]);

  useEffect(() => {
    let cancelled = false;
    async function loadStock() {
      if (!productId) { setLedger([]); setBalances([]); setLoading(false); return; }
      setLoading(true);
      try {
        const ledgerQuery = { product_id: productId };
        const balanceQuery = { product_id: productId };
        if (branchId) { ledgerQuery.branch_id = branchId; balanceQuery.branch_id = branchId; }
        if (warehouseId) { ledgerQuery.warehouse_id = warehouseId; balanceQuery.warehouse_id = warehouseId; }
        const [ledgerRows, balanceRows] = await Promise.all([
          base44.entities.StockLedger.filter(ledgerQuery, "date", 1000),
          base44.entities.StockBalance.filter(balanceQuery, "warehouse_name", 500),
        ]);
        if (!cancelled) { setLedger(ledgerRows || []); setBalances(balanceRows || []); }
      } catch (error) {
        if (!cancelled) toast({ title: "Gagal memuat kartu stok", description: error.message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadStock();
    return () => { cancelled = true; };
  }, [productId, branchId, warehouseId, toast]);

  const selectedProduct = products.find((item) => item.id === productId);
  const periodRows = useMemo(() => ledger.filter((row) => {
    const date = (row.date || "").slice(0, 10);
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;
    if (search) {
      const text = `${row.ref_code || ""} ${row.ref_type || ""} ${row.warehouse_name || ""} ${row.note || ""}`.toLowerCase();
      if (!text.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [ledger, dateFrom, dateTo, search]);

  const summary = useMemo(() => {
    const totalIn = periodRows.filter((row) => isIncoming(row.movement_type)).reduce((sum, row) => sum + (row.quantity || 0), 0);
    const totalOut = periodRows.filter((row) => !isIncoming(row.movement_type)).reduce((sum, row) => sum + (row.quantity || 0), 0);
    return { available: balances.reduce((sum, row) => sum + (row.quantity || 0), 0), totalIn, totalOut };
  }, [periodRows, balances]);

  const maxWarehouseStock = Math.max(1, ...balances.map((item) => item.quantity || 0));

  const exportCsv = () => {
    const header = ["Tanggal", "No. Transaksi", "Tipe Transaksi", "Gudang", "SKU", "Produk", "Masuk", "Keluar", "Saldo", "Satuan", "Keterangan"];
    const rows = periodRows.map((row) => [row.date, row.ref_code, TYPE_LABEL[row.movement_type] || row.movement_type, row.warehouse_name, row.sku, row.product_name, isIncoming(row.movement_type) ? row.quantity : "", isIncoming(row.movement_type) ? "" : row.quantity, row.balance_after, selectedProduct?.unit || "pcs", row.note || ""]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `kartu-stok-${selectedProduct?.sku || "produk"}-${dateFrom}-${dateTo}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 print:p-0">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div><h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Kartu Stok Detail</h1><p className="mt-1 text-sm text-muted-foreground">Telusuri stok berdasarkan jenis barang, produk, gudang, dan transaksi</p></div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className={inputClass} />
          <span className="text-muted-foreground">—</span>
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className={inputClass} />
          <button onClick={exportCsv} disabled={!periodRows.length} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-accent disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button>
          <button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-accent"><FileDown className="h-4 w-4" />Export PDF</button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid grid-cols-4 rounded-xl bg-muted p-1 print:hidden">
            {TABS.map((tab) => <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${activeTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>)}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {isSuperAdmin && <label className="space-y-1.5"><span className="text-xs font-semibold">Cabang</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)} className={`${inputClass} w-full`}><option value="">Semua Cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>}
            <label className="space-y-1.5"><span className="text-xs font-semibold">Gudang</span><select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} disabled={!branchId} className={`${inputClass} w-full`}><option value="">Semua Gudang</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
            <label className={`space-y-1.5 ${!isSuperAdmin ? "sm:col-span-1" : "sm:col-span-2"}`}><span className="text-xs font-semibold">Pilih {TABS.find((tab) => tab.key === activeTab)?.label}</span><select value={productId} onChange={(event) => setProductId(event.target.value)} className={`${inputClass} w-full`}><option value="">— Pilih produk —</option>{tabProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label>
          </div>
          {selectedProduct && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-muted/50 px-4 py-3 text-xs text-muted-foreground"><span>SKU: <strong className="text-foreground">{selectedProduct.sku}</strong></span><span>Merek: <strong className="text-foreground">{selectedProduct.brand || "—"}</strong></span><span>Satuan: <strong className="text-foreground">{selectedProduct.unit || "pcs"}</strong></span><span>Minimum: <strong className="text-foreground">{selectedProduct.min_stock || 0}</strong></span></div>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Ringkasan Cepat</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            <QuickMetric icon={Boxes} label="Stok Tersedia" value={summary.available} tone="blue" />
            <QuickMetric icon={TrendingUp} label="Total Masuk" value={summary.totalIn} tone="green" />
            <QuickMetric icon={TrendingDown} label="Total Keluar" value={summary.totalOut} tone="red" />
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2"><Warehouse className="h-5 w-5 text-primary" /><h2 className="font-semibold">Stok Saat Ini (Per Gudang)</h2></div>
        {balances.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">Belum ada saldo stok untuk produk ini.</div> : <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{balances.map((balance) => <div key={balance.id} className="rounded-xl border border-border p-4"><div className="flex justify-between gap-3 text-sm"><span className="font-medium">{balance.warehouse_name || "Gudang tidak diketahui"}</span><strong>{balance.quantity || 0} {balance.unit || selectedProduct?.unit || "pcs"}</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(2, ((balance.quantity || 0) / maxWarehouseStock) * 100)}%` }} /></div></div>)}</div>}
      </section>

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5"><h2 className="font-semibold">Pergerakan Stok</h2><div className="relative mt-4 max-w-lg print:hidden"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari no. transaksi / gudang / tipe / keterangan..." className={`${inputClass} w-full pl-9`} /></div></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground"><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">No. Transaksi</th><th className="px-4 py-3">Tipe Transaksi</th><th className="px-4 py-3">Gudang</th><th className="px-4 py-3 text-right">Masuk</th><th className="px-4 py-3 text-right">Keluar</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3">Satuan</th><th className="px-4 py-3">Keterangan</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="py-14 text-center text-muted-foreground">Memuat pergerakan stok...</td></tr> : periodRows.length === 0 ? <tr><td colSpan={9} className="py-14 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />Belum ada pergerakan stok pada filter ini.</td></tr> : periodRows.slice().reverse().map((row) => {
                const incoming = isIncoming(row.movement_type);
                return <tr key={row.id} className="border-b border-border last:border-0 hover:bg-accent/30"><td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.date)}</td><td className="px-4 py-3 font-mono text-xs font-medium">{row.ref_code || "—"}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${incoming ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{TYPE_LABEL[row.movement_type] || row.movement_type}</span></td><td className="px-4 py-3">{row.warehouse_name || "—"}</td><td className="px-4 py-3 text-right font-semibold text-emerald-600">{incoming ? row.quantity || 0 : "—"}</td><td className="px-4 py-3 text-right font-semibold text-red-600">{incoming ? "—" : row.quantity || 0}</td><td className="px-4 py-3 text-right font-bold">{row.balance_after ?? 0}</td><td className="px-4 py-3">{selectedProduct?.unit || "pcs"}</td><td className="max-w-xs px-4 py-3 text-muted-foreground">{row.note || `${TYPE_LABEL[row.movement_type] || "Pergerakan"} ${row.ref_code || ""}`}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
