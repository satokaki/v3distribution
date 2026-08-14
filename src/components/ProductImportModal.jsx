import React, { useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";
import { parseProductImportMatrix, parseProductImportText, prepareProductImport } from "@/lib/productImportCore";

export default function ProductImportModal({ open, onClose, products, categories, onCommit }) {
  const [preview, setPreview] = useState([]);
  const [fileName, setFileName] = useState("");
  const [importMeta, setImportMeta] = useState({ headerRow: null, totalRows: 0 });
  const [committing, setCommitting] = useState(false);
  if (!open) return null;

  const downloadTemplate = () => {
    const headers = ["Nama Barang", "Kategori", "Merk", "Barcode", "Harga Beli", "Harga Jual", "Satuan", "Subkategori", "Jenis Barang", "Isi per Karton", "Kadar Nikotin", "Volume", "Harga Grosir", "Harga Antar Cabang", "Minimum Stok"];
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    worksheet["!cols"] = headers.map((header) => ({ wch: Math.max(14, header.length + 2) }));
    worksheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Master Barang");
    XLSX.writeFile(workbook, "Template-Import-Master-Barang-V3.xlsx");
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileName(file.name);
    const extension = file.name.split(".").pop()?.toLowerCase();
    let rows;
    if (["xlsx", "xls"].includes(extension)) {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellText: true, cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = parseProductImportMatrix(XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" }));
    } else rows = parseProductImportText(await file.text());
    setImportMeta(rows.importMeta || { headerRow: null, totalRows: rows.length });
    setPreview(prepareProductImport(rows, products, categories));
  };

  const ready = preview.filter((row) => row.status === "READY");
  const commit = async () => {
    if (!ready.length) return;
    setCommitting(true);
    try { await onCommit(ready.map((row) => row.payload)); setPreview([]); setFileName(""); setImportMeta({ headerRow: null, totalRows: 0 }); onClose(); }
    finally { setCommitting(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-6 py-4"><div><h2 className="text-lg font-semibold">Import Master Barang</h2><p className="text-sm text-muted-foreground">Pilih file legacy atau gunakan template standar. Hanya Nama Barang yang wajib; SKU resmi dibuat otomatis oleh POS V3.</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <div className="border-b bg-emerald-50/50 px-6 py-4">
        <div className="flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><Upload className="h-4 w-4" /> Import File<input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" className="hidden" onChange={handleFile} /></label><button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-xl border border-emerald-600 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"><Download className="h-4 w-4" /> Download Template Excel</button></div>
        <span className="ml-3 text-sm text-slate-600">{fileName || "Header minimal: Nama Barang"}</span>
        {fileName && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600"><span>Header ditemukan pada baris: {importMeta.headerRow ?? "—"}</span><span>Total row dibaca: {importMeta.totalRows}</span><span>READY: {ready.length}</span><span>DUPLICATE: {preview.filter((row) => row.status === "DUPLICATE").length}</span><span>INVALID: {preview.filter((row) => row.status === "INVALID").length}</span></div>}
      </div>
      <div className="min-h-64 flex-1 overflow-auto p-6">
        {!preview.length ? <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed text-slate-400"><FileSpreadsheet className="mb-3 h-10 w-10" /><p>Upload file untuk membuat preview.</p><p className="mt-1 text-xs">Contoh: Nama Barang | Kategori | Merk</p></div> :
        <table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50 text-left"><tr>{["Baris", "Nama Barang", "Kode Legacy", "Barcode Legacy", "SKU Resmi V3", "Kategori", "Merk", "Harga Beli", "Status", "Keterangan"].map((header) => <th key={header} className="border-b px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody>{preview.map((row) => <tr key={row.row} className="border-b last:border-0"><td className="px-3 py-2 text-slate-500">{row.row}</td><td className="px-3 py-2 font-medium">{row.name || "—"}</td><td className="px-3 py-2 font-mono text-xs">{row.legacy_code || "—"}</td><td className="px-3 py-2 font-mono text-xs">{row.legacy_barcode || "—"}</td><td className="px-3 py-2 font-mono text-xs font-semibold text-emerald-700">{row.sku || "—"}</td><td className="px-3 py-2">{row.category || "—"}</td><td className="px-3 py-2">{row.brand || "—"}</td><td className="px-3 py-2">{row.purchase_price ?? "—"}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === "READY" ? "bg-emerald-100 text-emerald-700" : row.status === "DUPLICATE" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{row.status}</span></td><td className="px-3 py-2 text-xs text-slate-500">{row.message}</td></tr>)}</tbody></table>}
      </div>
      <div className="flex items-center justify-between border-t px-6 py-4"><div className="text-sm text-slate-600">{preview.length ? `${ready.length} READY · ${preview.length - ready.length} tidak akan diimport` : "Belum ada data"}</div><div className="flex gap-2"><button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-medium">Batal</button><button disabled={!ready.length || committing} onClick={commit} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Commit {ready.length} Barang</button></div></div>
    </div>
  </div>;
}
