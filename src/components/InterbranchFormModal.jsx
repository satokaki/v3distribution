import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import { applyStockMovement } from "@/lib/stockPosting";
import { writeAuditLog } from "@/lib/audit";
import { generateCode, formatCurrency } from "@/lib/utils";
import { X, Loader2, Plus, Trash2 } from "lucide-react";

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

export default function InterbranchFormModal({ open, onClose, onSaved, existingCount }) {
  const { toast } = useToast();
  const { activeBranchId, isSuperAdmin } = useBranchContext();
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [stockMap, setStockMap] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    seller_branch_id: "",
    seller_warehouse_id: "",
    buyer_branch_id: "",
    buyer_warehouse_id: "",
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
        const allowed = isSuperAdmin ? b : b.filter((x) => x.id === activeBranchId);
        setBranches(b);
        setWarehouses(w || []);
        setProducts((p || []).filter((x) => x.is_active !== false));
        const first = allowed[0]?.id || "";
        setForm((f) => ({ ...f, seller_branch_id: f.seller_branch_id || first, buyer_branch_id: f.buyer_branch_id || (allowed[1]?.id || first) }));
        setItems([{ product_id: "", product_name: "", sku: "", qty: 1, price: 0, subtotal: 0, unit: "pcs" }]);
      } catch {
        toast({ title: "Gagal memuat data master", variant: "destructive" });
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!form.seller_warehouse_id) { setStockMap({}); return; }
    (async () => {
      try {
        const balances = await base44.entities.StockBalance.filter({ warehouse_id: form.seller_warehouse_id });
        const map = {};
        (balances || []).forEach((s) => { map[s.product_id] = s.quantity; });
        setStockMap(map);
      } catch { setStockMap({}); }
    })();
  }, [form.seller_warehouse_id]);

  if (!open) return null;

  const sellerWhs = warehouses.filter((w) => w.branch_id === form.seller_branch_id && w.is_active !== false);
  const buyerWhs = warehouses.filter((w) => w.branch_id === form.buyer_branch_id && w.is_active !== false);

  const setItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { product_id: "", product_name: "", sku: "", qty: 1, price: 0, subtotal: 0, unit: "pcs" }]);
  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const onPickProduct = (i, productId) => {
    const p = products.find((x) => x.id === productId);
    const price = p?.interbranch_price || p?.purchase_price || 0;
    setItem(i, { product_id: productId, product_name: p?.name || "", sku: p?.sku || "", unit: p?.unit || "pcs", price, subtotal: price * (Number(items[i].qty) || 0) });
  };
  const recalc = (i, patch) => {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, ...patch };
      next.subtotal = (Number(next.qty) || 0) * (Number(next.price) || 0);
      return next;
    }));
  };

  const total = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);

  const handleSubmit = async (action) => {
    if (!form.seller_branch_id || !form.buyer_branch_id) return toast({ title: "Pilih cabang penjual & pembeli", variant: "destructive" });
    if (!form.seller_warehouse_id || !form.buyer_warehouse_id) return toast({ title: "Pilih gudang penjual & pembeli", variant: "destructive" });
    if (form.seller_warehouse_id === form.buyer_warehouse_id) return toast({ title: "Gudang penjual & pembeli tidak boleh sama", variant: "destructive" });
    const validItems = items.filter((it) => it.product_id && Number(it.qty) > 0);
    if (validItems.length === 0) return toast({ title: "Tambahkan minimal 1 item", variant: "destructive" });

    const sBranch = branches.find((b) => b.id === form.seller_branch_id) || {};
    const bBranch = branches.find((b) => b.id === form.buyer_branch_id) || {};
    const sWh = warehouses.find((w) => w.id === form.seller_warehouse_id) || {};
    const bWh = warehouses.find((w) => w.id === form.buyer_warehouse_id) || {};
    const code = generateCode("JBC", existingCount || 0, 5);
    const status = action === "post" ? "posted" : "draft";
    const finalItems = validItems.map((it) => ({ product_id: it.product_id, product_name: it.product_name, sku: it.sku, qty: Number(it.qty), price: Number(it.price) || 0, subtotal: (Number(it.qty) || 0) * (Number(it.price) || 0), unit: it.unit }));

    setSubmitting(true);
    try {
      const created = await base44.entities.InterbranchTransaction.create({
        code, date: form.date,
        seller_branch_id: form.seller_branch_id, seller_branch_code: sBranch.code || "", seller_branch_name: sBranch.name || "",
        seller_warehouse_id: form.seller_warehouse_id, seller_warehouse_name: sWh.name || "",
        buyer_branch_id: form.buyer_branch_id, buyer_branch_code: bBranch.code || "", buyer_branch_name: bBranch.name || "",
        buyer_warehouse_id: form.buyer_warehouse_id, buyer_warehouse_name: bWh.name || "",
        items: finalItems, total, status, note: form.note,
      });

      if (action === "post") {
        for (const it of finalItems) {
          const product = { product_id: it.product_id, product_name: it.product_name, sku: it.sku, unit: it.unit };
          await applyStockMovement({
            product, branch: { id: sBranch.id, code: sBranch.code }, warehouse: { id: sWh.id, name: sWh.name },
            type: "transfer_out", direction: "out", qty: it.qty,
            refType: "interbranch", refId: created.id, refCode: code, note: `Jual antar cabang ${code} → ${bBranch.code || ""}`,
          });
          await applyStockMovement({
            product, branch: { id: bBranch.id, code: bBranch.code }, warehouse: { id: bWh.id, name: bWh.name },
            type: "transfer_in", direction: "in", qty: it.qty,
            refType: "interbranch", refId: created.id, refCode: code, note: `Beli antar cabang ${code} ← ${sBranch.code || ""}`,
          });
        }
        await writeAuditLog({ action: "post_interbranch", module: "jual-beli-cabang", description: `Posting ${code}: ${sBranch.code} → ${bBranch.code} · ${formatCurrency(total)}`, branchId: form.seller_branch_id });
        toast({ title: "Transaksi antar cabang diposting & stok diperbarui" });
      } else {
        await writeAuditLog({ action: "create_interbranch_draft", module: "jual-beli-cabang", description: `Draft ${code}`, branchId: form.seller_branch_id });
        toast({ title: "Draft disimpan" });
      }
      onSaved && onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Gagal menyimpan transaksi", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-card rounded-2xl shadow-2xl border border-border">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold">Jual Beli Antar Cabang</h2>
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
                <div className="text-xs font-semibold text-muted-foreground mb-2">PENJUAL</div>
                <label className="block text-xs font-medium mb-1">Cabang Penjual</label>
                <select value={form.seller_branch_id} onChange={(e) => setForm({ ...form, seller_branch_id: e.target.value, seller_warehouse_id: "" })} disabled={!isSuperAdmin} className={inputCls}>
                  <option value="">— pilih —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                </select>
                <label className="block text-xs font-medium mb-1 mt-2">Gudang Penjual</label>
                <select value={form.seller_warehouse_id} onChange={(e) => setForm({ ...form, seller_warehouse_id: e.target.value })} className={inputCls}>
                  <option value="">— pilih —</option>
                  {sellerWhs.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
                </select>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs font-semibold text-muted-foreground mb-2">PEMBELI</div>
                <label className="block text-xs font-medium mb-1">Cabang Pembeli</label>
                <select value={form.buyer_branch_id} onChange={(e) => setForm({ ...form, buyer_branch_id: e.target.value, buyer_warehouse_id: "" })} className={inputCls}>
                  <option value="">— pilih —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                </select>
                <label className="block text-xs font-medium mb-1 mt-2">Gudang Pembeli</label>
                <select value={form.buyer_warehouse_id} onChange={(e) => setForm({ ...form, buyer_warehouse_id: e.target.value })} className={inputCls}>
                  <option value="">— pilih —</option>
                  {buyerWhs.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Item</h3>
              <button onClick={addItem} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border border-border hover:bg-accent">
                <Plus className="w-3.5 h-3.5" /> Tambah Item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <select value={it.product_id} onChange={(e) => onPickProduct(i, e.target.value)} className={inputCls}>
                      <option value="">— pilih produk —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                    </select>
                    {it.product_id && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">Stok: <span className="font-medium">{stockMap[it.product_id] ?? 0}</span> {it.unit}</div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <input type="number" min="1" value={it.qty} onChange={(e) => recalc(i, { qty: e.target.value })} className={inputCls} placeholder="Qty" />
                  </div>
                  <div className="col-span-3">
                    <input type="number" min="0" value={it.price} onChange={(e) => recalc(i, { price: e.target.value })} className={inputCls} placeholder="Harga" />
                  </div>
                  <div className="col-span-1 text-xs text-muted-foreground text-center">{it.unit}</div>
                  <div className="col-span-1 text-right">
                    <button onClick={() => removeItem(i)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right text-sm font-medium mt-2">Total: {formatCurrency(total)}</div>
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
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Posting
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
