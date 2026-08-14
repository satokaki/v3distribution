import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import { applyStockMovement } from "@/lib/stockPosting";
import { writeAuditLog } from "@/lib/audit";
import { generateCode } from "@/lib/utils";
import { X, Loader2, Plus, Trash2 } from "lucide-react";

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

export default function MutasiFormModal({ open, onClose, onSaved, existingCount }) {
  const { toast } = useToast();
  const { activeBranchId, isSuperAdmin } = useBranchContext();
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [stockMap, setStockMap] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    from_branch_id: "",
    from_warehouse_id: "",
    to_branch_id: "",
    to_warehouse_id: "",
    note: "",
  });
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [b, w, p] = await Promise.all([
          base44.entities.Branch.list(),
          base44.entities.Warehouse.list(),
          base44.entities.Product.list(),
        ]);
        // Filter cabang sesuai akses
        const allowed = isSuperAdmin ? b : b.filter((x) => x.id === activeBranchId);
        setBranches(b);
        setWarehouses(w || []);
        setProducts((p || []).filter((x) => x.is_active !== false));
        // default from_branch = cabang aktif / pertama
        const firstFrom = allowed[0]?.id || "";
        setForm((f) => ({ ...f, from_branch_id: f.from_branch_id || firstFrom, to_branch_id: f.to_branch_id || (allowed[1]?.id || firstFrom) }));
        setItems([{ product_id: "", product_name: "", sku: "", qty: 1, unit: "pcs" }]);
      } catch {
        toast({ title: "Gagal memuat data master", variant: "destructive" });
      }
    })();
  }, [open]);

  // Muat stok untuk gudang asal terpilih
  useEffect(() => {
    if (!form.from_warehouse_id) { setStockMap({}); return; }
    (async () => {
      try {
        const balances = await base44.entities.StockBalance.filter({ warehouse_id: form.from_warehouse_id });
        const map = {};
        (balances || []).forEach((s) => { map[s.product_id] = s.quantity; });
        setStockMap(map);
      } catch {
        setStockMap({});
      }
    })();
  }, [form.from_warehouse_id]);

  if (!open) return null;

  const fromWhs = warehouses.filter((w) => w.branch_id === form.from_branch_id && w.is_active !== false);
  const toWhs = warehouses.filter((w) => w.branch_id === form.to_branch_id && w.is_active !== false);

  const setItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { product_id: "", product_name: "", sku: "", qty: 1, unit: "pcs" }]);
  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const onPickProduct = (i, productId) => {
    const p = products.find((x) => x.id === productId);
    setItem(i, { product_id: productId, product_name: p?.name || "", sku: p?.sku || "", unit: p?.unit || "pcs" });
  };

  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);

  const handleSubmit = async (action) => {
    if (!form.from_branch_id || !form.to_branch_id) return toast({ title: "Pilih cabang asal & tujuan", variant: "destructive" });
    if (!form.from_warehouse_id || !form.to_warehouse_id) return toast({ title: "Pilih gudang asal & tujuan", variant: "destructive" });
    if (form.from_warehouse_id === form.to_warehouse_id) return toast({ title: "Gudang asal & tujuan tidak boleh sama", variant: "destructive" });
    const validItems = items.filter((it) => it.product_id && Number(it.qty) > 0);
    if (validItems.length === 0) return toast({ title: "Tambahkan minimal 1 item", variant: "destructive" });

    const fromBranch = branches.find((b) => b.id === form.from_branch_id) || {};
    const toBranch = branches.find((b) => b.id === form.to_branch_id) || {};
    const fromWh = warehouses.find((w) => w.id === form.from_warehouse_id) || {};
    const toWh = warehouses.find((w) => w.id === form.to_warehouse_id) || {};
    const code = generateCode("MTS", existingCount || 0, 5);
    const status = action === "post" ? "posted" : "draft";

    setSubmitting(true);
    try {
      const created = await base44.entities.StockTransfer.create({
        code,
        date: form.date,
        from_branch_id: form.from_branch_id,
        from_branch_code: fromBranch.code || "",
        from_branch_name: fromBranch.name || "",
        from_warehouse_id: form.from_warehouse_id,
        from_warehouse_name: fromWh.name || "",
        to_branch_id: form.to_branch_id,
        to_branch_code: toBranch.code || "",
        to_branch_name: toBranch.name || "",
        to_warehouse_id: form.to_warehouse_id,
        to_warehouse_name: toWh.name || "",
        items: validItems.map((it) => ({ product_id: it.product_id, product_name: it.product_name, sku: it.sku, qty: Number(it.qty), unit: it.unit })),
        total_qty: totalQty,
        status,
        note: form.note,
      });

      if (action === "post") {
        for (const it of validItems) {
          const product = { product_id: it.product_id, product_name: it.product_name, sku: it.sku, unit: it.unit };
          // keluar dari gudang asal
          await applyStockMovement({
            product, branch: { id: fromBranch.id, code: fromBranch.code }, warehouse: { id: fromWh.id, name: fromWh.name },
            type: "transfer_out", direction: "out", qty: Number(it.qty),
            refType: "transfer", refId: created.id, refCode: code, note: `Mutasi keluar ${code} → ${toBranch.code || ""}`,
          });
          // masuk ke gudang tujuan
          await applyStockMovement({
            product, branch: { id: toBranch.id, code: toBranch.code }, warehouse: { id: toWh.id, name: toWh.name },
            type: "transfer_in", direction: "in", qty: Number(it.qty),
            refType: "transfer", refId: created.id, refCode: code, note: `Mutasi masuk ${code} ← ${fromBranch.code || ""}`,
          });
        }
        await writeAuditLog({ action: "post_transfer", module: "mutasi", description: `Posting mutasi ${code}: ${fromBranch.code} → ${toBranch.code}`, branchId: form.from_branch_id });
        toast({ title: "Mutasi diposting & stok diperbarui" });
      } else {
        await writeAuditLog({ action: "create_transfer_draft", module: "mutasi", description: `Draft mutasi ${code}`, branchId: form.from_branch_id });
        toast({ title: "Draft mutasi disimpan" });
      }
      onSaved && onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Gagal menyimpan mutasi", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-card rounded-2xl shadow-2xl border border-border">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold">Mutasi Stok Antar Cabang</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Tanggal</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
            </div>
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs font-semibold text-muted-foreground mb-2">ASAL</div>
                <label className="block text-xs font-medium mb-1">Cabang Asal</label>
              <select value={form.from_branch_id} onChange={(e) => setForm({ ...form, from_branch_id: e.target.value, from_warehouse_id: "" })} disabled={!isSuperAdmin} className={inputCls}>
                  <option value="">— pilih —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                </select>
                <label className="block text-xs font-medium mb-1 mt-2">Gudang Asal</label>
                <select value={form.from_warehouse_id} onChange={(e) => setForm({ ...form, from_warehouse_id: e.target.value })} className={inputCls}>
                  <option value="">— pilih —</option>
                  {fromWhs.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
                </select>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs font-semibold text-muted-foreground mb-2">TUJUAN</div>
                <label className="block text-xs font-medium mb-1">Cabang Tujuan</label>
                <select value={form.to_branch_id} onChange={(e) => setForm({ ...form, to_branch_id: e.target.value, to_warehouse_id: "" })} className={inputCls}>
                  <option value="">— pilih —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                </select>
                <label className="block text-xs font-medium mb-1 mt-2">Gudang Tujuan</label>
                <select value={form.to_warehouse_id} onChange={(e) => setForm({ ...form, to_warehouse_id: e.target.value })} className={inputCls}>
                  <option value="">— pilih —</option>
                  {toWhs.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Item Mutasi</h3>
              <button onClick={addItem} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border border-border hover:bg-accent">
                <Plus className="w-3.5 h-3.5" /> Tambah Item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6">
                    <select value={it.product_id} onChange={(e) => onPickProduct(i, e.target.value)} className={inputCls}>
                      <option value="">— pilih produk —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                    </select>
                    {it.product_id && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Stok tersedia: <span className="font-medium">{stockMap[it.product_id] ?? 0}</span> {it.unit}
                      </div>
                    )}
                  </div>
                  <div className="col-span-3">
                    <input type="number" min="1" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} className={inputCls} placeholder="Qty" />
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground text-center">{it.unit}</div>
                  <div className="col-span-1 text-right">
                    <button onClick={() => removeItem(i)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right text-sm font-medium mt-2">Total Qty: {totalQty}</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Catatan</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className={inputCls} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent">Batal</button>
            <button type="button" onClick={() => handleSubmit("draft")} disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent disabled:opacity-50 inline-flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Simpan Draft
            </button>
            <button type="button" onClick={() => handleSubmit("post")} disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Posting Mutasi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
