import React, { useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { parseProductImportText, prepareProductImport } from "@/lib/productImportCore";

export default function ProductImportModal({ open, onClose, products, categories, onCommit }) {
  const [preview, setPreview] = useState([]);
  const [fileName, setFileName] = useState("");
  const [committing, setCommitting] = useState(false);
  if (!open) return null;

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setPreview(prepareProductImport(parseProductImportText(await file.text()), products, categories));
  };

  const ready = preview.filter((row) => row.status === "READY");
  const commit = async () => {
    if (!ready.length) return;
    setCommitting(true);
    try { await onCommit(ready.map((row) => row.payload)); setPreview([]); setFileName(""); onClose(); }
    finally { setCommitting(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-6 py-4"><div><h2 className="text-lg font-semibold">Import Master Barang</h2><p className="text-sm text-muted-foreground">Nama Barang wajib. ID Barang, SKU, kategori, dan merk boleh kosong.</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <div className="border-b bg-emerald-50/50 px-6 py-4">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><Upload className="h-4 w-4" /> Pilih CSV / TSV<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="hidden" onChange={handleFile} /></label>
        <span className="ml-3 text-sm text-slate-600">{fileName || "Header minimal: Nama Barang"}</span>
      </div>
      <div className="min-h-64 flex-1 overflow-auto p-6">
        {!preview.length ? <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed text-slate-400"><FileSpreadsheet className="mb-3 h-10 w-10" /><p>Upload file untuk membuat preview.</p><p className="mt-1 text-xs">Contoh: Nama Barang | Kategori | Merk</p></div> :
        <table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50 text-left"><tr>{["Baris", "Nama Barang", "ID hasil generate", "SKU hasil generate", "Kategori", "Merk", "Status"].map((header) => <th key={header} className="border-b px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody>{preview.map((row) => <tr key={row.row} className="border-b last:border-0"><td className="px-3 py-2 text-slate-500">{row.row}</td><td className="px-3 py-2 font-medium">{row.name || "—"}</td><td className="px-3 py-2 font-mono text-xs">{row.product_code}</td><td className="px-3 py-2 font-mono text-xs">{row.sku}</td><td className="px-3 py-2">{row.category || "—"}</td><td className="px-3 py-2">{row.brand || "—"}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === "READY" ? "bg-emerald-100 text-emerald-700" : row.status === "DUPLICATE" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{row.status}</span><div className="mt-1 text-xs text-slate-500">{row.message}</div></td></tr>)}</tbody></table>}
      </div>
      <div className="flex items-center justify-between border-t px-6 py-4"><div className="text-sm text-slate-600">{preview.length ? `${ready.length} READY · ${preview.length - ready.length} tidak akan diimport` : "Belum ada data"}</div><div className="flex gap-2"><button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-medium">Batal</button><button disabled={!ready.length || committing} onClick={commit} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Commit {ready.length} Barang</button></div></div>
    </div>
  </div>;
}
