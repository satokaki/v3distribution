import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useBranchContext } from "@/lib/BranchContext";
import { useToast } from "@/components/ui/use-toast";
import { postSale } from "@/lib/posting";
import { generateDailyCode } from "@/lib/transactionCode";
import { writeAuditLog } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";
import { getBranchProductBalance } from "@/lib/branchStockBalance";
import { Barcode, Banknote, CreditCard, FileText, Landmark, Minus, Plus, QrCode, ReceiptText, RefreshCcw, Save, Search, Trash2, UserRound } from "lucide-react";

const PAYMENT_CHANNELS = [
  { key: "cash", label: "Cash", icon: Banknote }, { key: "card", label: "Card", icon: CreditCard },
  { key: "qr", label: "QR", icon: QrCode }, { key: "edc", label: "EDC", icon: CreditCard },
  { key: "transfer", label: "Transfer", icon: Landmark },
];
const fieldClass = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30";
const localDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

export default function SalesPOSNew() {
  const { toast } = useToast();
  const { operationalBranchId, operationalBranch } = useBranchContext();
  const barcodeRef = useRef(null);
  const [master, setMaster] = useState({ products: [], customers: [], salespersons: [], accounts: [], receivables: [] });
  const [stockByProduct, setStockByProduct] = useState({});
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [transactionType, setTransactionType] = useState("cash");
  const [paymentChannel, setPaymentChannel] = useState("cash");
  const [salespersonId, setSalespersonId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [paid, setPaid] = useState(/** @type {any} */ (0));
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [editingDraftId, setEditingDraftId] = useState("");
  const branchId = operationalBranchId;
  const activeBranch = operationalBranch; // presentation-only compatibility inside this component

  const loadDrafts = async () => {
    if (!branchId) return setDrafts([]);
    const rows = await base44.entities.Sale.filter({ branch_id: branchId, status: "draft" }, "-created_date", 12);
    setDrafts(rows || []);
  };

  useEffect(() => {
    if (!branchId) { setLoading(false); return; }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [products, customers, salespersons, accounts, receivables] = await Promise.all([
          base44.entities.Product.list("name", 500), base44.entities.Customer.list("name", 500),
          base44.entities.Salesperson.filter({ branch_id: branchId, is_active: true }, "name", 200),
          base44.entities.Account.filter({ branch_id: branchId, is_active: true }, "name", 100),
          base44.entities.Receivable.filter({ branch_id: branchId }, "-due_date", 500),
        ]);
        if (!cancelled) {
          setMaster({ products: (products || []).filter((p) => p.is_active !== false), customers: customers || [], salespersons: salespersons || [], accounts: accounts || [], receivables: receivables || [] });
          setSalespersonId((salespersons || [])[0]?.id || "");
          setAccountId((accounts || []).find((a) => a.account_type === "kas")?.id || "");
          await loadDrafts();
        }
      } catch (error) { toast({ title: "Gagal memuat terminal penjualan", description: error.message, variant: "destructive" }); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [branchId, toast]);

  const customer = master.customers.find((row) => row.id === customerId);
  const salesperson = master.salespersons.find((row) => row.id === salespersonId);
  const account = master.accounts.find((row) => row.id === accountId);
  const needsAccount = transactionType === "cash" && paymentChannel !== "cash";
  const customerOverdue = customer ? master.receivables.some((row) => row.customer_id === customer.id && row.status !== "paid" && row.due_date && row.due_date.slice(0, 10) < localDate()) : false;

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const discount = items.reduce((sum, item) => sum + item.qty * item.price * (item.discount_percent || 0) / 100, 0);
    const total = Math.max(0, subtotal - discount);
    return { qty: items.reduce((sum, item) => sum + item.qty, 0), subtotal, discount, total, change: Math.max(0, Number(paid || 0) - total) };
  }, [items, paid]);

  const suggestions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return master.products.filter((product) => `${product.barcode || ""} ${product.sku || ""} ${product.name || ""} ${product.brand || ""}`.toLowerCase().includes(keyword)).slice(0, 8);
  }, [query, master.products]);

  const priceFor = (product) => {
    if (transactionType === "cash") return { price: product.grosir_price || product.retail_price || 0, source: product.grosir_price ? "grosir_cash" : "default_retail" };
    return { price: product.retail_price || product.grosir_price || 0, source: product.retail_price ? "retail_tempo" : "default_grosir" };
  };

  const addProduct = async (product) => {
    if (!branchId) return toast({ title: "Cabang user belum tersedia", variant: "destructive" });
    try {
      const resolved = await getBranchProductBalance(branchId, product.id);
      setStockByProduct((current) => ({ ...current, [product.id]: resolved.quantity }));
    } catch (error) {
      toast({ title: "Gagal membaca stok cabang", description: error.message, variant: "destructive" });
      return;
    }
    const priced = priceFor(product);
    setItems((current) => {
      const found = current.find((item) => item.product_id === product.id);
      if (found) return current.map((item) => item.product_id === product.id ? { ...item, qty: item.qty + 1 } : item);
      return [...current, { product_id: product.id, product_name: product.name, sku: product.sku, qty: 1, price: priced.price, discount_percent: 0, price_source: priced.source }];
    });
    setQuery(""); barcodeRef.current?.focus();
  };

  useEffect(() => {
    setItems((current) => current.map((item) => { const product = master.products.find((row) => row.id === item.product_id); const priced = product ? priceFor(product) : { price: item.price, source: item.price_source }; return { ...item, price: priced.price, price_source: priced.source }; }));
  }, [transactionType]);

  const updateItem = (id, patch) => setItems((current) => current.map((item) => item.product_id === id ? { ...item, ...patch, qty: Math.max(1, Number(patch.qty ?? item.qty)), discount_percent: Math.min(100, Math.max(0, Number(patch.discount_percent ?? item.discount_percent))) } : item));
  const reset = () => { setEditingDraftId(""); setTransactionType("cash"); setPaymentChannel("cash"); setCustomerId(""); setNote(""); setPaid(0); setItems([]); setStockByProduct({}); setQuery(""); barcodeRef.current?.focus(); };

  const payload = () => ({
    date: localDate(), branch_id: branchId, branch_code: operationalBranch?.branch_code || "",
    salesperson_id: salespersonId, salesperson_name: salesperson?.name || "", customer_id: customerId, customer_name: customer?.name || "",
    transaction_type: transactionType, payment_method: transactionType === "tempo" ? "kredit" : "tunai", payment_channel: transactionType === "tempo" ? "tempo" : paymentChannel,
    account_id: transactionType === "cash" ? (account?.id || "") : "", account_name: transactionType === "cash" ? (account?.name || "") : "",
    sale_type: customer?.customer_type === "retail" ? "retail" : "grosir", due_date: transactionType === "tempo" ? new Date(Date.now() + (customer?.payment_terms || 14) * 86400000).toISOString().slice(0, 10) : "",
    items: items.map((item) => ({ ...item, discount_amount: item.qty * item.price * item.discount_percent / 100, subtotal: item.qty * item.price * (1 - item.discount_percent / 100) })),
    subtotal: totals.subtotal, discount_total: totals.discount, total_qty: totals.qty, total: totals.total, amount_paid: transactionType === "cash" ? Number(paid || totals.total) : 0, change_amount: totals.change, note,
  });

  const validate = () => {
    if (!branchId) throw new Error("Head Office harus memilih konteks satu cabang sebelum membuat transaksi.");
    if (!salespersonId) throw new Error("Pilih sales.");
    if (!items.length) throw new Error("Tambahkan minimal satu produk.");
    const insufficient = items.find((item) => stockByProduct[item.product_id] != null && item.qty > stockByProduct[item.product_id]);
    if (insufficient) throw new Error(`Stok cabang ${insufficient.product_name} tidak cukup (tersedia ${stockByProduct[insufficient.product_id]}).`);
    if (transactionType === "tempo") {
      if (!customer) throw new Error("Customer wajib dipilih untuk transaksi tempo.");
      if (customer.is_active === false) throw new Error("Customer tidak aktif.");
      if (customerOverdue) throw new Error("Customer mempunyai piutang overdue.");
      if ((customer.receivable_balance || 0) + totals.total > (customer.credit_limit || 0)) throw new Error("Transaksi melewati credit limit customer.");
    }
    if (needsAccount && (!account || account.account_type === "kas")) throw new Error("Pilih rekening tujuan non-kas.");
    if (transactionType === "cash" && paymentChannel === "cash" && Number(paid || 0) < totals.total) throw new Error("Nominal bayar masih kurang.");
  };

  const saveDraft = async () => {
    try { validate(); setBusy(true); let code = ""; if (editingDraftId) { code = drafts.find((row) => row.id === editingDraftId)?.code || "Draft"; await base44.entities.Sale.update(editingDraftId, { ...payload(), status: "draft" }); } else { code = await generateDailyCode("Sale", "DRF", localDate()); await base44.entities.Sale.create({ ...payload(), code, status: "draft" }); } await writeAuditLog({ action: editingDraftId ? "update_sale_draft" : "create_sale_draft", module: "penjualan", description: `Draft ${code}`, branchId }); toast({ title: "Draft tersimpan", description: code }); reset(); await loadDrafts(); }
    catch (error) { toast({ title: "Draft gagal disimpan", description: error.message, variant: "destructive" }); } finally { setBusy(false); }
  };

  const post = async () => {
    try { validate(); setBusy(true); const created = await postSale(payload()); if (editingDraftId) await base44.entities.Sale.delete(editingDraftId); toast({ title: "Penjualan berhasil diposting", description: created.code }); reset(); await loadDrafts(); }
    catch (error) { toast({ title: "Posting gagal", description: error.message, variant: "destructive" }); } finally { setBusy(false); }
  };

  const openDraft = async (draft) => { if (draft.branch_id && draft.branch_id !== branchId) toast({ title: "Draft dibuat pada cabang berbeda", description: "Stok, rekening, sales, dan posting menggunakan cabang operasional saat ini." }); setEditingDraftId(draft.id); setTransactionType(draft.transaction_type || (draft.payment_method === "kredit" ? "tempo" : "cash")); setPaymentChannel(draft.payment_channel || "cash"); setSalespersonId(draft.salesperson_id || ""); setCustomerId(draft.customer_id || ""); setAccountId(draft.account_id || ""); setNote(draft.note || ""); setPaid(draft.amount_paid || 0); const draftItems = (draft.items || []).map((item) => ({ ...item, discount_percent: item.discount_percent || 0 })); setItems(draftItems); try { const balances = await Promise.all(draftItems.map(async (item) => [item.product_id, (await getBranchProductBalance(branchId, item.product_id)).quantity])); setStockByProduct(Object.fromEntries(balances)); } catch (error) { toast({ title: "Draft dibuka, stok gagal dimuat", description: error.message, variant: "destructive" }); } };
  const deleteDraft = async (draft) => { await base44.entities.Sale.delete(draft.id); await loadDrafts(); toast({ title: `Draft ${draft.code} dihapus` }); };

  useEffect(() => {
    const handler = (event) => { if (event.key === "F2") { event.preventDefault(); barcodeRef.current?.focus(); } if (event.key === "F3") { event.preventDefault(); saveDraft(); } if (event.key === "Escape") reset(); };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  });

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Menyiapkan terminal penjualan...</div>;

  return (
    <div className="space-y-4 pb-28 lg:pb-0">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h1 className="text-2xl font-bold">PENJUALAN BARU</h1><p className="text-sm text-muted-foreground">{activeBranch?.branch_name || "Pilih satu cabang"}</p></div><div className="flex flex-wrap gap-2"><Link to="/laporan/penjualan" className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-accent"><ReceiptText className="h-4 w-4" />Laporan Penjualan</Link><button onClick={saveDraft} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-accent"><FileText className="h-4 w-4" />Draft <kbd>F3</kbd></button><button onClick={reset} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-accent"><RefreshCcw className="h-4 w-4" />Reset</button></div></header>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="grid gap-5 border-b p-5 lg:grid-cols-2"><label className="space-y-1.5"><span className="text-sm font-medium">Sales</span><div className="relative"><UserRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><select value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} className={`${fieldClass} pl-9`}><option value="">Pilih sales</option>{master.salespersons.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div></label><div className="space-y-1.5"><span className="text-sm font-medium">Tipe Pembayaran</span><div className="grid grid-cols-2 gap-2">{["cash", "tempo"].map((type) => <button key={type} onClick={() => { setTransactionType(type); if (type === "tempo") setPaymentChannel("tempo"); else setPaymentChannel("cash"); }} className={`h-11 rounded-lg border text-sm font-semibold uppercase ${transactionType === type ? "border-emerald-600 bg-emerald-600 text-white" : "hover:bg-accent"}`}>{type}</button>)}</div></div>
            {transactionType === "cash" && <div className="space-y-2 lg:col-span-2"><span className="text-sm font-medium">Metode Pembayaran</span><div className="flex flex-wrap gap-2">{PAYMENT_CHANNELS.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => setPaymentChannel(key)} className={`inline-flex h-11 min-w-28 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium ${paymentChannel === key ? "border-emerald-600 bg-emerald-600 text-white" : "hover:bg-accent"}`}><Icon className="h-4 w-4" />{label}</button>)}</div></div>}
            <label className="space-y-1.5"><span className="text-sm font-medium">Pelanggan {transactionType === "cash" && <span className="font-normal text-muted-foreground">(opsional)</span>}</span><select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={fieldClass}><option value="">Cari nama / kode / nomor HP / toko</option>{master.customers.filter((row) => row.is_active !== false).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.store_name || row.name} · {row.phone || "-"}</option>)}</select>{customer && <div className={`rounded-lg p-3 text-xs ${customerOverdue ? "bg-red-50 text-red-700" : "bg-muted/60 text-muted-foreground"}`}><strong>{customer.store_name || customer.name}</strong> · {customer.customer_type} · Tempo {customer.payment_terms || 0} hari · Piutang {formatCurrency(customer.receivable_balance || 0)} · Limit {formatCurrency(customer.credit_limit || 0)}{customerOverdue && " · OVERDUE"}</div>}</label><label className="space-y-1.5"><span className="text-sm font-medium">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan transaksi..." className={fieldClass} /></label>
            {needsAccount && <label className="space-y-1.5 lg:col-span-2"><span className="text-sm font-medium">Rekening Tujuan</span><select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={fieldClass}><option value="">Pilih rekening tujuan</option>{master.accounts.filter((row) => row.account_type !== "kas").map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
          </div>
          <div className="p-5"><h2 className="mb-3 font-semibold">Item Barang</h2><div className="relative"><Barcode className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><input ref={barcodeRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) addProduct(suggestions[0]); }} placeholder="Scan barcode / cari SKU, produk, atau brand..." className={`${fieldClass} pl-9`} />{suggestions.length > 0 && <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover p-1 shadow-xl">{suggestions.map((product) => <button key={product.id} onClick={() => addProduct(product)} className="flex w-full justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"><span><strong>{product.name}</strong><small className="ml-2 text-muted-foreground">{product.sku} · {product.brand || ""}</small></span><span>{formatCurrency(priceFor(product).price)}</span></button>)}</div>}</div>
            <div className="mt-4 overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40 text-left"><th className="p-3">Produk</th><th className="p-3 text-center">Qty</th><th className="p-3 text-right">Harga</th><th className="p-3 text-center">Diskon</th><th className="p-3 text-right">Subtotal</th><th className="p-3"></th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">Scan barcode atau cari produk untuk mulai.</td></tr> : items.map((item) => <tr key={item.product_id} className="border-b last:border-0"><td className="p-3"><strong>{item.product_name}</strong><div className="text-xs text-muted-foreground">SKU: {item.sku} · {item.price_source}</div></td><td className="p-3"><div className="mx-auto flex w-28 items-center rounded-lg border"><button onClick={() => updateItem(item.product_id, { qty: item.qty - 1 })} className="h-9 w-9"><Minus className="mx-auto h-4 w-4" /></button><input type="number" value={item.qty} onChange={(e) => updateItem(item.product_id, { qty: e.target.value })} className="h-9 w-10 border-x bg-transparent text-center" /><button onClick={() => updateItem(item.product_id, { qty: item.qty + 1 })} className="h-9 w-9"><Plus className="mx-auto h-4 w-4" /></button></div></td><td className="p-3 text-right font-medium">{formatCurrency(item.price)}</td><td className="p-3"><input type="number" value={item.discount_percent} onChange={(e) => updateItem(item.product_id, { discount_percent: e.target.value })} className="mx-auto block h-9 w-20 rounded-lg border text-center" /></td><td className="p-3 text-right font-semibold">{formatCurrency(item.qty * item.price * (1 - item.discount_percent / 100))}</td><td className="p-3"><button onClick={() => setItems((current) => current.filter((row) => row.product_id !== item.product_id))} className="text-red-600"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
          </div>
          <div className="hidden justify-between border-t p-5 lg:flex"><button disabled={busy} onClick={saveDraft} className="inline-flex h-12 items-center gap-2 rounded-lg border px-5 font-medium hover:bg-accent"><Save className="h-4 w-4" />Simpan Draft</button><button disabled={busy} onClick={post} className="inline-flex h-12 min-w-64 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Save className="h-4 w-4" />Simpan & Posting</button></div>
        </main>
        <aside className="space-y-4"><section className="sticky top-20 rounded-2xl border bg-card p-5 shadow-sm"><h2 className="text-lg font-semibold">Ringkasan</h2><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span>Total Qty</span><strong>{totals.qty}</strong></div><div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div><div className="flex justify-between"><span>Total Diskon</span><span>{formatCurrency(totals.discount)}</span></div><div className="flex justify-between border-t pt-3 text-lg"><strong>Total</strong><strong className="text-emerald-600">{formatCurrency(totals.total)}</strong></div>{transactionType === "cash" && paymentChannel === "cash" ? <><label className="block border-t pt-3"><span>Bayar</span><input type="number" value={paid} onChange={(e) => setPaid(e.target.value)} className={`${fieldClass} mt-2 text-right`} /></label><div className="flex justify-between"><span>Kembali</span><strong className="text-emerald-600">{formatCurrency(totals.change)}</strong></div></> : transactionType === "tempo" ? <><div className="flex justify-between border-t pt-3"><span>Tempo</span><strong>{customer?.payment_terms || 14} hari</strong></div><div className="flex justify-between"><span>Jatuh Tempo</span><strong>{payload().due_date || "—"}</strong></div><div className="flex justify-between"><span>Total Piutang</span><strong>{formatCurrency(totals.total)}</strong></div></> : null}</div></section>
          <section className="rounded-2xl border bg-card p-4"><div className="mb-3 flex justify-between"><h2 className="font-semibold">Draft Terbaru</h2><span className="text-xs text-muted-foreground">{drafts.length} draft</span></div><div className="max-h-[420px] space-y-2 overflow-y-auto">{drafts.map((draft) => <div key={draft.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between"><strong>{draft.code}</strong><span className="rounded bg-amber-100 px-2 text-xs text-amber-700">Draft</span></div><div className="mt-1 text-xs text-muted-foreground">{draft.customer_name || "Tanpa customer"} · {draft.salesperson_name || "-"}</div><div className="mt-2 flex items-center justify-between"><strong>{formatCurrency(draft.total || 0)}</strong><div className="flex gap-1"><button onClick={() => openDraft(draft)} className="rounded border p-2 text-emerald-600"><Search className="h-3.5 w-3.5" /></button><button onClick={() => deleteDraft(draft)} className="rounded border p-2 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></div></div></div>)}{drafts.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Belum ada draft.</p>}</div></section>
        </aside>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t bg-background/95 p-3 backdrop-blur lg:hidden"><div><div className="text-xs text-muted-foreground">Total</div><strong className="text-emerald-600">{formatCurrency(totals.total)}</strong></div><div className="flex gap-2"><button onClick={saveDraft} className="h-11 rounded-lg border px-4 text-sm font-medium">Draft</button><button onClick={post} className="h-11 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white">Posting</button></div></div>
    </div>
  );
}
