import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import { approveStockTransfer, saveStockTransferDraft } from "@/lib/stockTransfer";
import { Loader2, Plus, Trash2, X } from "lucide-react";

const inputCls = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const emptyItem = () => ({ product_id: "", product_name: "", sku: "", qty: 1, unit: "pcs" });

export default function MutasiFormModal({ open, onClose, onSaved, editing = null }) {
  const { toast } = useToast();
  const { accessibleBranches, isSuperAdmin, operationalBranchId } = useBranchContext();
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [destinationId, setDestinationId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [approvalRequestId, setApprovalRequestId] = useState(() => crypto.randomUUID());

  const sourceMapping = accessibleBranches.find((row) => row.branch_id === operationalBranchId);
  const sourceId = sourceMapping?.branch_id || "";
  const sourceName = sourceMapping?.branch_name || sourceMapping?.branch_code || "Cabang belum dipetakan";
  const canSave = Boolean(sourceMapping) && (isSuperAdmin || (editing ? sourceMapping?.can_edit : sourceMapping?.can_create));
  const canApprove = Boolean(sourceMapping) && (isSuperAdmin || sourceMapping?.can_approve || sourceMapping?.can_post);

  useEffect(() => {
    if (!open) return;
    setApprovalRequestId(crypto.randomUUID());
    setDate(editing?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
    setDestinationId(editing?.destination_branch_id || editing?.to_branch_id || "");
    setNotes(editing?.notes || editing?.note || "");
    setItems(editing?.items?.length ? editing.items.map((row) => ({ ...row, qty: row.requested_qty ?? row.qty })) : [emptyItem()]);
    Promise.all([base44.entities.Branch.list("name", 500), base44.entities.Product.list("name", 5000)])
      .then(([branchRows, productRows]) => { setBranches((branchRows || []).filter((row) => row.is_active !== false)); setProducts((productRows || []).filter((row) => row.is_active !== false)); })
      .catch((error) => toast({ title: "Gagal memuat form mutasi", description: error.message, variant: "destructive" }));
  }, [editing, open, toast]);

  const destinations = useMemo(() => branches.filter((branch) => branch.id !== sourceId), [branches, sourceId]);
  const totalQty = items.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const updateItem = (index, patch) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const pickProduct = (index, id) => { const product = products.find((row) => row.id === id); updateItem(index, { product_id: id, product_name: product?.name || "", sku: product?.sku || "", unit: product?.unit || "pcs" }); };

  if (!open) return null;

  const save = async (approve) => {
    if (!sourceId) return toast({ title: "Cabang asal belum dipetakan", variant: "destructive" });
    if (!destinationId || destinationId === sourceId) return toast({ title: "Cabang tujuan tidak valid", variant: "destructive" });
    const validItems = items.filter((row) => row.product_id && Number(row.qty) > 0);
    if (!validItems.length || validItems.length !== items.length) return toast({ title: "Lengkapi seluruh produk dan qty", variant: "destructive" });
    setSubmitting(true);
    try {
      const result = await saveStockTransferDraft({ transfer_id: editing?.id, date, destination_branch_id: destinationId, notes, items: validItems.map((row) => ({ ...row, qty: Number(row.qty) })) });
      if (approve) await approveStockTransfer(result.transfer.id, approvalRequestId);
      toast({ title: approve ? "Mutasi disetujui dan dalam perjalanan" : editing ? "Draft diperbarui" : "Draft mutasi disimpan" });
      await onSaved?.(); onClose();
    } catch (error) { toast({ title: "Mutasi gagal diproses", description: `${error.code || "INVALID_TRANSFER"}: ${error.message}`, variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
    <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-card shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-6 py-4"><div><h2 className="text-lg font-semibold">{editing ? "Edit Draft Mutasi" : "Mutasi Antar Cabang"}</h2><p className="text-xs text-muted-foreground">Cabang asal ditentukan otomatis dari user</p></div><button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent"><X className="h-5 w-5" /></button></div>
      <div className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <label><span className="mb-1.5 block text-sm font-medium">Tanggal</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputCls} /></label>
          <div><span className="mb-1.5 block text-sm font-medium">Dari</span><div className={`${inputCls} bg-muted font-semibold`}>{sourceName}</div></div>
          <label><span className="mb-1.5 block text-sm font-medium">Tujuan</span><select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} className={inputCls}><option value="">— pilih cabang —</option>{destinations.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>
        </div>
        <div className="border-t pt-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Produk</h3><button onClick={() => setItems((rows) => [...rows, emptyItem()])} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"><Plus className="h-3.5 w-3.5" />Tambah Item</button></div>
          <div className="space-y-2">{items.map((item, index) => <div key={index} className="grid grid-cols-12 items-center gap-2"><div className="col-span-8"><select value={item.product_id} onChange={(event) => pickProduct(index, event.target.value)} className={inputCls}><option value="">— pilih produk —</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></div><div className="col-span-3"><input type="number" min="1" value={item.qty} onChange={(event) => updateItem(index, { qty: event.target.value })} className={inputCls} /></div><button onClick={() => setItems((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="col-span-1 rounded-lg p-2 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button></div>)}</div>
          <div className="mt-2 text-right text-sm font-semibold">Total Qty: {totalQty}</div>
        </div>
        <label><span className="mb-1.5 block text-sm font-medium">Catatan</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={inputCls} /></label>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium">Batal</button><button onClick={() => save(false)} disabled={submitting || !canSave} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}Simpan Draft</button><button onClick={() => save(true)} disabled={submitting || !canSave || !canApprove} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}Approve &amp; Kirim</button></div>
      </div>
    </div>
  </div>;
}
