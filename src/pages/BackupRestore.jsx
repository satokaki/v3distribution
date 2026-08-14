import React, { useMemo, useRef, useState } from "react";
import { Archive, DatabaseBackup, Download, FileUp, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useBranchContext } from "@/lib/BranchContext";
import {
  BACKUP_PAGE_SIZE,
  BACKUP_SCHEMA_VERSION,
  RESTORE_BATCH_SIZE,
  calculateProgress,
  createBackupDocument,
  splitBatches,
  validateBackupFile,
} from "@/lib/backupRestoreCore";

const EMPTY_PROGRESS = {
  running: false,
  action: "",
  entity: "",
  field: "",
  entityIndex: 0,
  entityTotal: 0,
  processed: 0,
  total: 0,
  batch: 0,
  batchTotal: 0,
  failed: 0,
  percent: 0,
};

function unwrap(response) {
  return response?.data ?? response;
}

async function invoke(payload) {
  return unwrap(await base44.functions.invoke("backupRestore", payload));
}

function downloadJson(backupDocument) {
  const blob = new Blob([JSON.stringify(backupDocument, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${backupDocument.manifest.backup_id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ModeCard({ icon: Icon, title, description, onClick, disabled, tone = "emerald" }) {
  const toneClass = tone === "blue" ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700";
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 min-h-10 text-sm text-slate-500">{description}</p>
      <button disabled={disabled} onClick={onClick} className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}>
        {disabled ? "Proses berjalan..." : title}
      </button>
    </div>
  );
}

export default function BackupRestore() {
  const { user, isSuperAdmin } = useBranchContext();
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [logs, setLogs] = useState([]);
  const fileInputRef = useRef(null);
  const restoreModeRef = useRef("operational");

  const progressLabel = useMemo(() => progress.running ? `${progress.percent}%` : "Siap", [progress]);

  const addLog = (message, type = "info") => setLogs((current) => [{ at: new Date().toLocaleTimeString("id-ID"), message, type }, ...current].slice(0, 100));

  const runBackup = async (mode) => {
    setLogs([]);
    setProgress({ ...EMPTY_PROGRESS, running: true, action: mode === "full" ? "Backup Full" : "Backup Transaksi" });
    try {
      const registryData = await invoke({ action: "registry" });
      const registry = registryData[mode];
      const entities = {};
      let completedEntities = 0;
      for (const { entity } of registry) {
        const records = [];
        let skip = 0;
        let page = 0;
        while (true) {
          page += 1;
          setProgress((current) => ({ ...current, entity, field: "Membaca semua field", entityIndex: completedEntities + 1, entityTotal: registry.length, batch: page, percent: calculateProgress(completedEntities, registry.length) }));
          const result = await invoke({ action: "backup_page", mode, entity, skip, limit: BACKUP_PAGE_SIZE });
          records.push(...(result.records || []));
          addLog(`${entity}: ${records.length} record dibaca`);
          if (!result.has_more) break;
          skip += result.count;
        }
        entities[entity] = records;
        completedEntities += 1;
        setProgress((current) => ({ ...current, processed: completedEntities, total: registry.length, percent: calculateProgress(completedEntities, registry.length) }));
      }
      const backup = createBackupDocument({ mode, createdBy: user?.email, registry, entities });
      downloadJson(backup);
      addLog(`${backup.manifest.backup_id}: ${backup.manifest.total_records} record selesai`, "success");
      setProgress((current) => ({ ...current, running: false, entity: "Selesai", field: "File berhasil diunduh", percent: 100 }));
      toast.success("Backup berhasil dibuat dan diunduh.");
    } catch (error) {
      addLog(error?.response?.data?.error || error.message || "Backup gagal", "error");
      setProgress((current) => ({ ...current, running: false }));
      toast.error("Backup gagal. Lihat log proses.");
    }
  };

  const chooseRestoreFile = (mode) => {
    restoreModeRef.current = mode;
    fileInputRef.current?.click();
  };

  const runRestore = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const mode = restoreModeRef.current;
    if (!window.confirm(`${mode === "full" ? "RESTORE FULL" : "RESTORE TRANSAKSI"}\n\nData existing dengan ID sama akan diperbarui. Lanjutkan?`)) return;
    setLogs([]);
    setProgress({ ...EMPTY_PROGRESS, running: true, action: mode === "full" ? "Restore Full" : "Restore Transaksi" });
    try {
      const backup = validateBackupFile(JSON.parse(await file.text()), mode);
      const registryData = await invoke({ action: "registry" });
      const registry = registryData[mode];
      const plan = registry.filter(({ entity }) => Array.isArray(backup.entities[entity]));
      const total = plan.reduce((sum, { entity }) => sum + backup.entities[entity].length, 0);
      let processed = 0;
      let failed = 0;

      for (let entityIndex = 0; entityIndex < plan.length; entityIndex += 1) {
        const { entity } = plan[entityIndex];
        const records = backup.entities[entity];
        const batches = splitBatches(records, RESTORE_BATCH_SIZE);
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
          const batch = batches[batchIndex];
          const fields = [...new Set(batch.flatMap((record) => Object.keys(record).filter((field) => !["created_date", "updated_date", "created_by", "created_by_id", "is_sample"].includes(field))))];
          setProgress({ running: true, action: mode === "full" ? "Restore Full" : "Restore Transaksi", entity, field: fields.join(", ") || "—", entityIndex: entityIndex + 1, entityTotal: plan.length, processed, total, batch: batchIndex + 1, batchTotal: batches.length, failed, percent: calculateProgress(processed, total) });
          const result = await invoke({ action: "restore_batch", mode, entity, schema_version: BACKUP_SCHEMA_VERSION, records: batch });
          processed += result.processed || batch.length;
          failed += result.failed || 0;
          addLog(`${entity} batch ${batchIndex + 1}/${batches.length}: ${result.success} sukses, ${result.failed} gagal`, result.failed ? "error" : "success");
          setProgress((current) => ({ ...current, processed, failed, percent: calculateProgress(processed, total) }));
        }
      }
      setProgress((current) => ({ ...current, running: false, entity: "Selesai", field: failed ? `${failed} record perlu ditinjau` : "Semua field selesai ditulis", percent: 100 }));
      if (failed) toast.warning(`Restore selesai dengan ${failed} record gagal.`);
      else toast.success("Restore selesai.");
    } catch (error) {
      const message = error?.response?.data?.error || error.message || "Restore gagal";
      addLog(message, "error");
      setProgress((current) => ({ ...current, running: false }));
      toast.error(message);
    }
  };

  if (!isSuperAdmin) return <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">Menu ini hanya tersedia untuk Admin / Super Admin.</div>;

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={runRestore} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Backup & Restore</h1><p className="mt-1 text-sm text-slate-500">Pengamanan data transaksi dan seluruh data aplikasi V3 Distribution.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"><ShieldCheck className="h-4 w-4" /> Admin only · batch restore {RESTORE_BATCH_SIZE} record</div>
      </div>

      <section><h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Buat Backup</h2><div className="grid gap-4 md:grid-cols-2">
        <ModeCard icon={Archive} title="Backup Transaksi" description="Sale, purchase, kas, hutang, piutang, mutasi, saldo dan ledger stok." disabled={progress.running} onClick={() => runBackup("operational")} />
        <ModeCard icon={DatabaseBackup} title="Backup Full" description="Master, konfigurasi bisnis, transaksi, audit dan data legacy yang masih digunakan." disabled={progress.running} onClick={() => runBackup("full")} />
      </div></section>

      <section><h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Restore dari File Backup</h2><div className="grid gap-4 md:grid-cols-2">
        <ModeCard icon={FileUp} title="Restore Transaksi" description="Restore entity transaksi saja sesuai urutan registry dan batch kecil." disabled={progress.running} tone="blue" onClick={() => chooseRestoreFile("operational")} />
        <ModeCard icon={RotateCcw} title="Restore Full" description="Restore master lalu transaksi sesuai urutan dependency yang aman." disabled={progress.running} tone="blue" onClick={() => chooseRestoreFile("full")} />
      </div></section>

      <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Progress Proses</h2><p className="text-sm text-slate-500">{progress.action || "Belum ada proses berjalan"}</p></div><div className="flex items-center gap-2 text-2xl font-bold text-emerald-700">{progress.running && <Loader2 className="h-5 w-5 animate-spin" />}{progressLabel}</div></div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-700 transition-all duration-300" style={{ width: `${progress.percent}%` }} /></div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">Entity</span><div className="mt-1 font-semibold">{progress.entity || "—"}</div><div className="text-xs text-slate-400">{progress.entityIndex}/{progress.entityTotal || 0}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">Field sedang ditulis</span><div className="mt-1 break-words font-semibold text-emerald-700">{progress.field || "—"}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">Record</span><div className="mt-1 font-semibold">{progress.processed.toLocaleString("id-ID")} / {progress.total.toLocaleString("id-ID")}</div><div className="text-xs text-slate-400">Gagal: {progress.failed}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">Batch</span><div className="mt-1 font-semibold">{progress.batch} / {progress.batchTotal || 0}</div></div>
        </div>
      </section>

      <section className="rounded-2xl border bg-slate-950 p-5 text-slate-100"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Log Proses</h2><button className="text-xs text-slate-400 hover:text-white" onClick={() => setLogs([])}>Bersihkan tampilan</button></div><div className="max-h-64 space-y-2 overflow-auto font-mono text-xs">{logs.length === 0 ? <div className="text-slate-500">Belum ada aktivitas.</div> : logs.map((log, index) => <div key={`${log.at}-${index}`} className={log.type === "error" ? "text-red-300" : log.type === "success" ? "text-emerald-300" : "text-slate-300"}>[{log.at}] {log.message}</div>)}</div></section>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Download className="mt-0.5 h-4 w-4 shrink-0" /><p>Backup menggunakan snapshot live best-effort. Restore tidak menjalankan posting penjualan, pembelian, atau mutasi. Record baru hanya diterima jika Base44 mempertahankan original ID dan read-back berhasil.</p></div>
    </div>
  );
}
