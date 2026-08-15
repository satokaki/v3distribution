import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useBranchContext } from "@/lib/BranchContext";
import { useToast } from "@/components/ui/use-toast";
import { postPurchase } from "@/lib/posting";
import { generateDailyCode } from "@/lib/transactionCode";
import { writeAuditLog } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";
import { Barcode, FileText, Minus, Plus, ReceiptText, RefreshCcw, Save, Search, ShoppingCart, Trash2 } from "lucide-react";

const fieldClass = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30";
const localDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const addDays = (date, days) => { const value = new Date(`${date}T00:00:00`); value.setDate(value.getDate() + Number(days || 0)); return value.toLocaleDateString("en-CA"); };

export default function PurchasePOSNew() {
  const { toast } = useToast();
  const { operationalBranchId, operationalBranch, isAllBranches, readScopeBranch } = useBranchContext();
  const searchRef = useRef(null);
  const branchId = operationalBranchId;
  const activeBranch = operationalBranch; // presentation-only compatibility inside this component
  const [master, setMaster] = useState({ suppliers: [], products: [], accounts: [] });
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(localDate());
  const [dueDate, setDueDate] = useState("");
  const [method, setMethod] = useState("kredit");
  const [channel, setChannel] = useState("cash");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState([]);
  const [editingDraftId, setEditingDraftId] = useState("");
  const [purchaseContextAllowed, setPurchaseContextAllowed] = useState(false);

  const loadDrafts = async () => {
    if (!branchId) return setDrafts([]);
    const rows = await base44.entities.Purchase.filter({ branch_id: branchId, status: "draft" }, "-created_date", 10);
    setDrafts(rows || []);
  };

  useEffect(() => {
    if (!branchId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [suppliers, products, accounts, branch] = await Promise.all([
          base44.entities.Supplier.list("name", 500), base44.entities.Product.list("name", 500),
          base44.entities.Account.filter({ branch_id: branchId, is_active: true }, "name", 100),
          base44.entities.Branch.get(branchId),
        ]);
        if (!cancelled) {
          const next = { suppliers: (suppliers || []).filter((x) => x.is_active !== false), products: (products || []).filter((x) => x.is_active !== false), accounts: accounts || [] };
          setMaster(next); setAccountId(next.accounts.find((x) => x.account_type === "kas")?.id || next.accounts[0]?.id || ""); setPurchaseContextAllowed(branch?.branch_type === "pusat"); await loadDrafts();
        }
      } catch (error) { toast({ title: "Gagal memuat terminal pembelian", description: error.message, variant: "destructive" }); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [branchId, toast]);

  const supplier = master.suppliers.find((x) => x.id === supplierId);
  const needsAccount = method === "tunai" && channel !== "cash";
  useEffect(() => { if (method === "kredit") setDueDate(addDays(date, supplier?.payment_terms || 14)); }, [date, supplierId, method]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, x) => sum + x.qty * x.price, 0);
    const discount = items.reduce((sum, x) => sum + x.qty * x.price * (x.discount_percent || 0) / 100, 0);
    return { qty: items.reduce((sum, x) => sum + x.qty, 0), subtotal, discount, total: Math.max(0, subtotal - discount) };
  }, [items]);
  const suggestions = useMemo(() => { const key = query.trim().toLowerCase(); return key ? master.products.filter((x) => `${x.barcode || ""} ${x.sku || ""} ${x.name || ""} ${x.brand || ""}`.toLowerCase().includes(key)).slice(0, 8) : []; }, [query, master.products]);
  const addProduct = (product) => { setItems((rows) => { const found = rows.find((x) => x.product_id === product.id); return found ? rows.map((x) => x.product_id === product.id ? { ...x, qty: x.qty + 1 } : x) : [...rows, { product_id: product.id, product_name: product.name, sku: product.sku, qty: 1, price: Number(product.purchase_price || 0), discount_percent: 0, price_source: "last_purchase_price" }]; }); setQuery(""); searchRef.current?.focus(); };
  const updateItem = (id, patch) => setItems((rows) => rows.map((x) => x.product_id === id ? { ...x, ...patch, qty: Math.max(1, Number(patch.qty ?? x.qty)), price: Math.max(0, Number(patch.price ?? x.price)), discount_percent: Math.min(100, Math.max(0, Number(patch.discount_percent ?? x.discount_percent))) } : x));
  const reset = () => { setSupplierId(""); setMethod("kredit"); setChannel("cash"); setDate(localDate()); setDueDate(""); setNote(""); setItems([]); setEditingDraftId(""); setQuery(""); searchRef.current?.focus(); };
  const payload = () => ({ date, supplier_id: supplierId, supplier_name: supplier?.name || "", branch_id: branchId, branch_code: activeBranch?.branch_code || "", account_id: method === "tunai" ? accountId : "", account_name: method === "tunai" ? (master.accounts.find((x) => x.id === accountId)?.name || "") : "", payment_method: method, payment_channel: method === "kredit" ? "kredit" : channel, due_date: method === "kredit" ? dueDate : "", items: items.map((x) => ({ ...x, discount_amount: x.qty * x.price * x.discount_percent / 100, subtotal: x.qty * x.price * (1 - x.discount_percent / 100) })), subtotal: totals.subtotal, discount_total: totals.discount, total_qty: totals.qty, total: totals.total, note });
  const validate = () => {
    if (!purchaseContextAllowed) {
      throw new Error(
        "PURCHASE_HEAD_OFFICE_ONLY: Pembelian supplier hanya dapat dilakukan saat cabang Pusat dipilih."
      );
    }
    if (!branchId) throw new Error("Head Office harus memiliki cabang transaksi.");
    if (!supplier) throw new Error("Pilih supplier.");
    if (!items.length) throw new Error("Tambahkan minimal satu produk.");
    if (method === "tunai" && !accountId) throw new Error("Cabang belum mempunyai rekening pembayaran aktif.");
    if (method === "kredit" && !dueDate) throw new Error("Isi tanggal jatuh tempo.");
  };
  const saveDraft = async () => { try { validate(); setBusy(true); let code; if (editingDraftId) { code = drafts.find((x) => x.id === editingDraftId)?.code || "Draft"; await base44.entities.Purchase.update(editingDraftId, { ...payload(), status: "draft" }); } else { code = await generateDailyCode("Purchase", "DRF-PBL", date); await base44.entities.Purchase.create({ ...payload(), code, status: "draft" }); } await writeAuditLog({ action: editingDraftId ? "update_purchase_draft" : "create_purchase_draft", module: "pembelian", description: `Draft ${code}`, branchId }); toast({ title: "Draft pembelian tersimpan", description: code }); reset(); await loadDrafts(); } catch (error) { toast({ title: "Draft gagal disimpan", description: error.message, variant: "destructive" }); } finally { setBusy(false); } };
  const post = async () => { try { validate(); setBusy(true); const created = await postPurchase(payload()); if (editingDraftId) await base44.entities.Purchase.delete(editingDraftId); toast({ title: "Pembelian berhasil diposting", description: created.code }); reset(); await loadDrafts(); } catch (error) { toast({ title: "Posting gagal", description: error.message, variant: "destructive" }); } finally { setBusy(false); } };
  const openDraft = (draft) => { if (draft.branch_id && draft.branch_id !== branchId) toast({ title: "Draft dibuat pada cabang berbeda", description: "Rekening dan posting menggunakan cabang operasional saat ini." }); setEditingDraftId(draft.id); setSupplierId(draft.supplier_id || ""); setAccountId(draft.account_id || ""); setDate(draft.date || localDate()); setDueDate(draft.due_date || ""); setMethod(draft.payment_method || "kredit"); setChannel(draft.payment_channel || "cash"); setNote(draft.note || ""); setItems((draft.items || []).map((x) => ({ ...x, discount_percent: x.discount_percent || 0 }))); };
  const deleteDraft = async (draft) => { await base44.entities.Purchase.delete(draft.id); await loadDrafts(); toast({ title: `Draft ${draft.code} dihapus` }); };

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Menyiapkan terminal pembelian...</div>;

  if (!purchaseContextAllowed) {
    const selectedName = isAllBranches
      ? "Semua Cabang"
      : (readScopeBranch?.branch_name || readScopeBranch?.name || "Cabang");

    return (
      <div className="space-y-4 pb-28 lg:pb-0">
        <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <ShoppingCart />
            </div>
            <div>
              <h1 className="text-2xl font-bold">PEMBELIAN BARU</h1>
              <p className="text-sm text-muted-foreground">{selectedName}</p>
            </div>
          </div>

          <Link
            to="/laporan/pembelian"
            className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-accent"
          >
            <ReceiptText className="h-4 w-4" />
            Laporan Pembelian
          </Link>
        </header>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="max-w-2xl">
            <h2 className="text-lg font-bold text-amber-950">
              Pembelian supplier hanya dapat dilakukan dari Pusat.
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              Cabang retail memperoleh stok melalui Mutasi. Pilih cabang bertipe
              Pusat / Head Office pada selector cabang kanan atas untuk membuat
              Draft atau Posting pembelian.
            </p>
            <div className="mt-4 rounded-xl border border-amber-200 bg-white/70 px-4 py-3 text-sm">
              <span className="font-medium">Konteks saat ini:</span> {selectedName}
            </div>
          </div>
        </section>
      </div>
    );
  }
  return <div className="space-y-4 pb-28 lg:pb-0">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><ShoppingCart /></div><div><h1 className="text-2xl font-bold">PEMBELIAN BARU</h1><p className="text-sm text-muted-foreground">{activeBranch?.branch_name || "Pilih satu cabang"}</p></div></div><div className="flex flex-wrap gap-2"><Link to="/laporan/pembelian" className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-accent"><ReceiptText className="h-4 w-4" />Laporan Pembelian</Link><button onClick={saveDraft} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium"><FileText className="h-4 w-4" />Draft</button><button onClick={reset} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium"><RefreshCcw className="h-4 w-4" />Reset</button></div></header>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"><main className="overflow-hidden rounded-2xl border bg-card shadow-sm"><div className="grid gap-4 border-b p-5 md:grid-cols-3">
      <label className="space-y-1.5 md:col-span-2"><span className="text-sm font-medium">Supplier</span><select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={fieldClass}><option value="">Cari nama / kode / nomor HP...</option>{master.suppliers.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name} · {x.phone || "-"}</option>)}</select>{supplier && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><strong>{supplier.name}</strong> · Tempo {supplier.payment_terms || 0} hari · Hutang {formatCurrency(supplier.debt_balance || 0)} · Limit {formatCurrency(supplier.debt_limit || 0)}</div>}</label>
      <label className="space-y-1.5"><span className="text-sm font-medium">Tanggal</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} /></label>
      <div className="space-y-1.5"><span className="text-sm font-medium">Metode Pembelian</span><div className="grid grid-cols-2 gap-2">{["kredit", "tunai"].map((x) => <button key={x} onClick={() => setMethod(x)} className={`h-11 rounded-lg border text-sm font-semibold uppercase ${method === x ? "border-emerald-600 bg-emerald-600 text-white" : ""}`}>{x}</button>)}</div></div>
      {method === "kredit" ? <label className="space-y-1.5"><span className="text-sm font-medium">Jatuh Tempo</span><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldClass} /></label> : <div className="space-y-1.5 md:col-span-2"><span className="text-sm font-medium">Pembayaran</span><div className="grid grid-cols-4 gap-2">{["cash", "transfer", "card", "edc"].map((x) => <button key={x} onClick={() => setChannel(x)} className={`h-11 rounded-lg border text-xs font-semibold uppercase ${channel === x ? "border-emerald-600 bg-emerald-600 text-white" : ""}`}>{x}</button>)}</div></div>}
      {needsAccount && <label className="space-y-1.5 md:col-span-3"><span className="text-sm font-medium">Rekening Pembayaran</span><select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={fieldClass}><option value="">Pilih rekening</option>{master.accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
    </div><div className="p-5"><div className="relative"><Barcode className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) addProduct(suggestions[0]); }} placeholder="Scan barcode / cari produk, SKU, atau brand..." className={`${fieldClass} pl-9`} />{suggestions.length > 0 && <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover p-1 shadow-xl">{suggestions.map((x) => <button key={x.id} onClick={() => addProduct(x)} className="flex w-full justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"><span><strong>{x.name}</strong><small className="ml-2 text-muted-foreground">{x.sku} · {x.brand || ""}</small></span><span>{formatCurrency(x.purchase_price || 0)}</span></button>)}</div>}</div>
      <div className="mt-4 overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40 text-left"><th className="p-3">Produk</th><th className="p-3 text-center">Qty</th><th className="p-3 text-right">Harga Beli</th><th className="p-3 text-center">Diskon %</th><th className="p-3 text-right">Subtotal</th><th /></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">Scan barcode atau cari produk untuk mulai.</td></tr> : items.map((x) => <tr key={x.product_id} className="border-b last:border-0"><td className="p-3"><strong>{x.product_name}</strong><div className="text-xs text-muted-foreground">SKU: {x.sku}</div></td><td className="p-3"><div className="mx-auto flex w-28 items-center rounded-lg border"><button onClick={() => updateItem(x.product_id, { qty: x.qty - 1 })} className="h-9 w-9"><Minus className="mx-auto h-4 w-4" /></button><input type="number" value={x.qty} onChange={(e) => updateItem(x.product_id, { qty: e.target.value })} className="h-9 w-10 border-x bg-transparent text-center" /><button onClick={() => updateItem(x.product_id, { qty: x.qty + 1 })} className="h-9 w-9"><Plus className="mx-auto h-4 w-4" /></button></div></td><td className="p-3"><input type="number" value={x.price} onChange={(e) => updateItem(x.product_id, { price: e.target.value })} className="ml-auto block h-9 w-28 rounded-lg border px-2 text-right" /></td><td className="p-3"><input type="number" value={x.discount_percent} onChange={(e) => updateItem(x.product_id, { discount_percent: e.target.value })} className="mx-auto block h-9 w-20 rounded-lg border text-center" /></td><td className="p-3 text-right font-semibold">{formatCurrency(x.qty * x.price * (1 - x.discount_percent / 100))}</td><td className="p-3"><button onClick={() => setItems((rows) => rows.filter((row) => row.product_id !== x.product_id))} className="text-red-600"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div><label className="mt-4 block space-y-1.5"><span className="text-sm font-medium">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan pembelian..." className={fieldClass} /></label>
    </div><div className="hidden justify-between border-t p-5 lg:flex"><button disabled={busy} onClick={saveDraft} className="inline-flex h-12 items-center gap-2 rounded-lg border px-5 font-medium"><Save className="h-4 w-4" />Simpan Draft</button><button disabled={busy} onClick={post} className="inline-flex h-12 min-w-64 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />Simpan & Posting</button></div></main>
      <aside className="space-y-4"><section className="sticky top-20 rounded-2xl border bg-card p-5 shadow-sm"><h2 className="font-semibold">RINGKASAN</h2><div className="mt-4 space-y-3 text-sm">{[["Total Qty", totals.qty], ["Subtotal", formatCurrency(totals.subtotal)], ["Diskon", formatCurrency(totals.discount)], ["PPN", formatCurrency(0)]].map(([a,b]) => <div key={a} className="flex justify-between"><span>{a}</span><strong>{b}</strong></div>)}<div className="flex justify-between border-t pt-3 text-lg"><strong>TOTAL</strong><strong className="text-emerald-600">{formatCurrency(totals.total)}</strong></div><div className="flex justify-between border-t pt-3"><span>Metode</span><strong className="capitalize text-emerald-600">{method}</strong></div>{method === "kredit" && <><div className="flex justify-between"><span>Jatuh Tempo</span><strong>{dueDate || "—"}</strong></div><div className="flex justify-between"><span>Hutang Sebelum</span><strong>{formatCurrency(supplier?.debt_balance || 0)}</strong></div><div className="flex justify-between"><span>Hutang Setelah</span><strong className="text-red-600">{formatCurrency((supplier?.debt_balance || 0) + totals.total)}</strong></div></>}</div></section>
      <section className="rounded-2xl border bg-card p-4"><div className="mb-3 flex justify-between"><h2 className="font-semibold">DRAFT TERBARU</h2><Link to="/laporan/pembelian" className="text-xs text-emerald-700">Lihat semua</Link></div><div className="space-y-2">{drafts.map((x) => <div key={x.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between"><strong>{x.code}</strong><span className="text-xs text-muted-foreground">{(x.created_date || "").slice(0,16).replace("T", " ")}</span></div><div className="mt-1 text-xs text-muted-foreground">{x.supplier_name || "Tanpa supplier"}</div><div className="mt-2 flex items-center justify-between"><strong>{formatCurrency(x.total || 0)}</strong><div className="flex gap-1"><button onClick={() => openDraft(x)} className="rounded border p-2 text-emerald-600"><Search className="h-3.5 w-3.5" /></button><button onClick={() => deleteDraft(x)} className="rounded border p-2 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></div></div></div>)}{drafts.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Belum ada draft.</p>}</div></section></aside>
    </div><div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t bg-white/95 p-3 backdrop-blur lg:hidden"><div><div className="text-xs text-muted-foreground">Total</div><strong className="text-emerald-600">{formatCurrency(totals.total)}</strong></div><div className="flex gap-2"><button onClick={saveDraft} className="h-11 rounded-lg border px-4 text-sm font-medium">Draft</button><button onClick={post} className="h-11 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white">Posting</button></div></div>
  </div>;
}