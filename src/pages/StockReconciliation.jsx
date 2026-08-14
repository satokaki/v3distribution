import React, { useEffect, useMemo, useState } from "react";
import { useBranchContext } from "@/lib/BranchContext";
import { buildStockReconciliation, filterStockReconciliation, reconciliationExportRows, summarizeStockReconciliation } from "@/lib/stockReconciliationCore";
import { fetchStockReconciliationData } from "@/lib/stockReconciliationData";
import { Download, Search, ShieldCheck } from "lucide-react";

const value = (input) => input === null ? "—" : Number(input).toLocaleString("id-ID");
const csvEscape = (input) => `"${String(input ?? "").replaceAll('"', '""')}"`;

export default function StockReconciliation() {
  const { readScopeBranchId, isAllBranches } = useBranchContext();
  const [model, setModel] = useState({ rows: [], neverStockedProducts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const [balances, ledgerRows, products, branches, warehouses] = await fetchStockReconciliationData(isAllBranches ? "" : readScopeBranchId);
        if (!cancelled) setModel(buildStockReconciliation({ balances, ledgerRows, products, branches, warehouses, branchIds: isAllBranches ? null : [readScopeBranchId] }));
      } catch (auditError) { if (!cancelled) setError(auditError.message || "Audit gagal dimuat"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [isAllBranches, readScopeBranchId]);

  const rows = useMemo(() => filterStockReconciliation(model.rows, { view, search }), [model.rows, search, view]);
  const summary = useMemo(() => summarizeStockReconciliation(model.rows), [model.rows]);
  const exportCsv = () => {
    const output = reconciliationExportRows(rows); if (!output.length) return;
    const headers = Object.keys(output[0]);
    const csv = [headers.map(csvEscape).join(","), ...output.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `audit-stok-${isAllBranches ? "semua-cabang" : readScopeBranchId}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const cards = [["Total Product-Branch", summary.total], ["Match", summary.match], ["Mismatch", summary.mismatch], ["Legacy Only", summary.legacy_only], ["Duplicate / Critical", summary.critical], ["Negative Stock", summary.negative], ["Orphan / Warning", summary.warning]];
  return <div className="space-y-5">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2"><ShieldCheck className="h-7 w-7 text-emerald-600" /><h1 className="text-2xl font-bold">AUDIT &amp; REKONSILIASI STOK</h1></div><p className="mt-1 text-sm text-muted-foreground">Diagnostic read-only per cabang dan produk · scope mengikuti selector global</p></div><button onClick={exportCsv} disabled={!rows.length} className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button></header>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{cards.map(([label, count]) => <div key={label} className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold">{count}</div></div>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-1">{[["all","Semua"],["mismatch","Mismatch"],["warning","Warning"],["match","Match"]].map(([key,label]) => <button key={key} onClick={() => setView(key)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${view === key ? "bg-emerald-600 text-white" : "bg-card"}`}>{label}</button>)}</div><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari SKU / produk..." className="h-10 w-72 rounded-lg border bg-background pl-9 pr-3 text-sm" /></div></div>
    <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40 text-left">{isAllBranches && <th className="p-3">Cabang</th>}<th className="p-3">SKU / Produk</th><th className="p-3 text-right">Branch Balance</th><th className="p-3 text-right">Legacy Aggregate</th><th className="p-3 text-right">Resolved</th><th className="p-3 text-right">Ledger Closing</th><th className="p-3 text-right">Difference</th><th className="p-3">Source</th><th className="p-3">Status / Flags</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={isAllBranches ? 9 : 8} className="p-12 text-center text-muted-foreground">Menjalankan audit read-only...</td></tr> : rows.length === 0 ? <tr><td colSpan={isAllBranches ? 9 : 8} className="p-12 text-center text-muted-foreground">Tidak ada hasil.</td></tr> : rows.map((row) => <tr key={row.id} className="border-b align-top last:border-0">{isAllBranches && <td className="p-3 font-medium">{row.branch_name}</td>}<td className="p-3"><strong>{row.sku || "—"}</strong><div className="text-xs text-muted-foreground">{row.product_name}</div></td><td className="p-3 text-right">{row.source === "AMBIGUOUS" ? "AMBIGUOUS" : value(row.branch_balance)}</td><td className="p-3 text-right">{value(row.legacy_aggregate)}</td><td className="p-3 text-right font-semibold">{row.resolved_balance === null ? "AMBIGUOUS" : value(row.resolved_balance)}</td><td className="p-3 text-right">{value(row.ledger_closing)}</td><td className={`p-3 text-right font-semibold ${row.difference ? "text-red-600" : "text-emerald-600"}`}>{value(row.difference)}</td><td className="p-3">{row.source}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === "MATCH" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{row.status}</span><div className="mt-2 flex max-w-sm flex-wrap gap-1">{row.flags.map((flag) => <span key={flag} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{flag}</span>)}</div><details className="mt-2 text-xs"><summary className="cursor-pointer text-emerald-700">Detail diagnostic</summary><div className="mt-2 space-y-1 rounded bg-muted/40 p-2"><div>Branch records: {row.branch_balance_count}</div><div>Legacy records: {row.legacy_balance_count}</div><div>Ledger movements: {row.ledger_movement_count}</div><div>Confirmed duplicates: {row.duplicate_ledgers.length}</div><div>Possible duplicates: {row.duplicate_candidates.length}</div><div>Latest: {row.latest_movement?.transaction_date || "—"} {row.latest_movement?.reference_number || ""}</div></div></details></td></tr>)}
    </tbody></table></div>
    {model.neverStockedProducts.length > 0 && <div className="rounded-xl border bg-card p-4 text-sm"><strong>NEVER_STOCKED_PRODUCT:</strong> {model.neverStockedProducts.length} produk aktif belum mempunyai saldo maupun ledger pada data yang terbaca. Tidak dibuat StockBalance baru.</div>}
  </div>;
}
