import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import MutasiFormModal from "@/components/MutasiFormModal";
import ReceiveTransferModal from "@/components/ReceiveTransferModal";
import { approveStockTransfer, deleteStockTransferDraft } from "@/lib/stockTransfer";
import { Edit3, Inbox, PackageCheck, Plus, Send, Trash2 } from "lucide-react";

const STATUS = {
  draft: { label: "Draft", style: "bg-amber-100 text-amber-700" },
  approved: { label: "Dalam Perjalanan", style: "bg-blue-100 text-blue-700" },
  received: { label: "Diterima", style: "bg-emerald-100 text-emerald-700" },
  posted: { label: "Legacy Posted", style: "bg-slate-100 text-slate-700" },
};
const sourceId = (row) => row.source_branch_id || row.from_branch_id;
const destinationId = (row) => row.destination_branch_id || row.to_branch_id;
const sourceName = (row) => row.source_branch_name || row.from_branch_name || row.from_branch_code || "—";
const destinationName = (row) => row.destination_branch_name || row.to_branch_name || row.to_branch_code || "—";
const number = (row) => row.transfer_number || row.code || "—";
const total = (row) => (row.items || []).reduce((sum, item) => sum + Number(item.approved_qty ?? item.requested_qty ?? item.qty ?? 0), 0);

export default function Mutasi() {
  const { toast } = useToast();
  const { operationalBranchId, readScopeBranchId, accessibleBranches, isAllBranches, isSuperAdmin } = useBranchContext();
  const activeBranchId = readScopeBranchId;
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [tab, setTab] = useState("outgoing");
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState(null); const [receiving, setReceiving] = useState(null);
  const approvalRequests = useRef(new Map());
  const mappedIds = useMemo(() => new Set(accessibleBranches.map((row) => row.branch_id)), [accessibleBranches]);
  const sourceMapping = accessibleBranches.find((row) => row.branch_id === operationalBranchId);
  const canCreate = Boolean(sourceMapping) && (isSuperAdmin || sourceMapping?.can_create);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.StockTransfer.list("-created_date", 5000);
      setRows(isSuperAdmin && isAllBranches ? (data || []) : (data || []).filter((row) => sourceId(row) === activeBranchId || destinationId(row) === activeBranchId));
    } catch (error) { toast({ title: "Gagal memuat mutasi", description: error.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [activeBranchId, isAllBranches, isSuperAdmin, toast]);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => rows.filter((row) => {
    if (tab === "incoming") return row.status === "approved" && (isSuperAdmin && isAllBranches ? true : destinationId(row) === activeBranchId);
    if (tab === "outgoing") return isSuperAdmin && isAllBranches ? ["draft", "approved"].includes(row.status) : sourceId(row) === activeBranchId && ["draft", "approved"].includes(row.status);
    return true;
  }), [activeBranchId, isAllBranches, isSuperAdmin, rows, tab]);

  const approve = async (row) => {
    const requestId = approvalRequests.current.get(row.id) || crypto.randomUUID(); approvalRequests.current.set(row.id, requestId);
    try { await approveStockTransfer(row.id, requestId); toast({ title: "Mutasi dalam perjalanan" }); await load(); }
    catch (error) { toast({ title: "Approval gagal", description: `${error.code || "INVALID_TRANSFER"}: ${error.message}`, variant: "destructive" }); }
  };
  const remove = async (row) => {
    if (row.status !== "draft") return toast({ title: "Hanya draft yang dapat dihapus", variant: "destructive" });
    if (!confirm(`Hapus draft ${number(row)}?`)) return;
    try { await deleteStockTransferDraft(row.id); toast({ title: "Draft dihapus" }); await load(); }
    catch (error) { toast({ title: "Draft gagal dihapus", description: error.message, variant: "destructive" }); }
  };
  const canReceive = (row) => row.status === "approved" && mappedIds.has(destinationId(row));

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h1 className="text-2xl font-bold">Mutasi Antar Cabang</h1><p className="text-sm text-muted-foreground">Draft → Dalam Perjalanan → Diterima</p></div>{canCreate && <button onClick={() => { setEditing(null); setFormOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />Mutasi Baru</button>}</div>
    <div className="flex gap-1 rounded-xl bg-muted p-1">{[["outgoing", "Mutasi Keluar"], ["incoming", "Mutasi Masuk"], ["history", "Riwayat"]].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${tab === key ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{label}</button>)}</div>
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b px-5 py-4"><h2 className="font-semibold">{tab === "incoming" ? "Mutasi Masuk" : tab === "outgoing" ? "Draft & Mutasi Keluar" : "Semua Riwayat"}</h2></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground"><th className="px-4 py-3">No Mutasi</th><th className="px-4 py-3">{tab === "incoming" ? "Dari" : "Tujuan"}</th><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3 text-right">Item</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={7} className="py-14 text-center text-muted-foreground">Memuat mutasi...</td></tr> : visible.length === 0 ? <tr><td colSpan={7} className="py-14 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />Belum ada mutasi.</td></tr> : visible.map((row) => { const status = STATUS[row.status] || { label: row.status, style: "bg-muted" }; const access = accessibleBranches.find((item) => item.branch_id === sourceId(row)); const ownsDraft = row.status === "draft" && sourceId(row) === sourceMapping?.branch_id; return <tr key={row.id} className="border-b last:border-0"><td className="px-4 py-3 font-mono text-xs font-semibold">{number(row)}</td><td className="px-4 py-3">{tab === "incoming" ? sourceName(row) : destinationName(row)}</td><td className="px-4 py-3">{row.approved_at?.slice(0, 10) || row.date?.slice(0, 10) || "—"}</td><td className="px-4 py-3 text-right">{row.items?.length || 0}</td><td className="px-4 py-3 text-right font-semibold">{total(row)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${status.style}`}>{status.label}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1">{ownsDraft && <>{(isSuperAdmin || access?.can_edit) && <button title="Edit" onClick={() => { setEditing(row); setFormOpen(true); }} className="rounded-lg p-2 hover:bg-accent"><Edit3 className="h-4 w-4" /></button>}{(isSuperAdmin || access?.can_approve || access?.can_post) && <button title="Approve & Kirim" onClick={() => approve(row)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"><Send className="h-4 w-4" /></button>}{(isSuperAdmin || access?.can_cancel) && <button title="Hapus" onClick={() => remove(row)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>}</>}{canReceive(row) && <button onClick={() => setReceiving(row)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"><PackageCheck className="h-4 w-4" />Terima Barang</button>}</div></td></tr>; })}
      </tbody></table></div>
    </section>
    <MutasiFormModal open={formOpen} editing={editing} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={load} />
    <ReceiveTransferModal transfer={receiving} onClose={() => setReceiving(null)} onSaved={load} />
  </div>;
}
