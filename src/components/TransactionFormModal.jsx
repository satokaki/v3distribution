import React, { useState, useEffect } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatCurrency } from "@/lib/utils";

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

export default function TransactionFormModal({ open, onClose, onSubmit, type }) {
  const isPurchase = type === "purchase";
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [products, setProducts] = useState([]);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [saleType, setSaleType] = useState("retail");
  const [paymentMethod, setPaymentMethod] = useState("tunai");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    base44.entities.Branch.list().then((r) => setBranches(r || []));
    base44.entities.Product.list().then((r) => setProducts(r || []));
    if (isPurchase) {
      base44.entities.Supplier.list().then((r) => setSuppliers(r || []));
    } else {
      base44.entities.Customer.list().then((r) => setCustomers(r || []));
    }
  }, [open, isPurchase]);

  useEffect(() => {
    if (!branchId) return;
    base44.entities.Warehouse.filter({ branch_id: branchId }).then((r) => setWarehouses(r || []));
    base44.entities.Account.filter({ branch_id: branchId }).then((r) => setAccounts(r || []));
    if (!isPurchase) base44.entities.Salesperson.filter({ branch_id: branchId }).then((r) => setSalespersons(r || []));
    setWarehouseId("");
    setAccountId("");
    setSalespersonId("");
  }, [branchId, isPurchase]);

  // Reprice items when sale type changes
  useEffect(() => {
    if (isPurchase) return;
    setItems((prev) =>
      prev.map((it) => {
        const p = products.find((x) => x.id === it.product_id);
        const price = p ? (saleType === "retail" ? p.retail_price || 0 : p.grosir_price || 0) : it.price;
        return { ...it, price, subtotal: (it.qty || 0) * price };
      })
    );
  }, [saleType, products, isPurchase]);

  if (!open) return null;

  const addItem = () =>
    setItems([...items, { product_id: "", product_name: "", sku: "", qty: 1, price: 0, subtotal: 0 }]);

  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const updateItem = (i, field, val) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: val };
    if (field === "product_id") {
      const p = products.find((x) => x.id === val);
      next[i].product_name = p?.name || "";
      next[i].sku = p?.sku || "";
      next[i].price = isPurchase
        ? p?.purchase_price || 0
        : saleType === "retail"
        ? p?.retail_price || 0
        : p?.grosir_price || 0;
    }
    next[i].subtotal = (next[i].qty || 0) * (next[i].price || 0);
    setItems(next);
  };

  const total = items.reduce((s, it) => s + (it.subtotal || 0), 0);

  const buildPayload = () => {
    const branch = branches.find((b) => b.id === branchId);
    const warehouse = warehouses.find((w) => w.id === warehouseId);
    const account = accounts.find((a) => a.id === accountId);
    return {
      date,
      branch_id: branchId,
      branch_code: branch?.code || "",
      warehouse_id: warehouseId,
      warehouse_name: warehouse?.name || "",
      account_id: accountId,
      account_name: account?.name || "",
      supplier_id: isPurchase ? partnerId : "",
      supplier_name: isPurchase ? suppliers.find((s) => s.id === partnerId)?.name || "" : "",
      customer_id: !isPurchase ? partnerId : "",
      customer_name: !isPurchase ? customers.find((c) => c.id === partnerId)?.name || "" : "",
      salesperson_id: !isPurchase ? salespersonId : "",
      salesperson_name: !isPurchase ? salespersons.find((s) => s.id === salespersonId)?.name || "" : "",
      sale_type: !isPurchase ? saleType : "",
      payment_method: paymentMethod,
      due_date: paymentMethod === "kredit" ? dueDate : "",
      items: items.map((it) => ({ ...it })),
      total,
      note,
    };
  };

  const submit = async (action) => {
    if (!branchId || !warehouseId || items.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmit(buildPayload(), action);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-card rounded-2xl shadow-2xl border border-border">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold">{isPurchase ? "Pembelian Baru" : "Penjualan Baru"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Tanggal</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Cabang <span className="text-destructive">*</span></label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
                <option value="">— Pilih —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Gudang <span className="text-destructive">*</span></label>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={!branchId} className={inputCls}>
                <option value="">— Pilih —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{isPurchase ? "Supplier" : "Pelanggan"}</label>
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={inputCls}>
                <option value="">— Pilih —</option>
                {(isPurchase ? suppliers : customers).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Rekening</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={!branchId} className={inputCls}>
                <option value="">— Pilih —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            {!isPurchase && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Sales</label>
                  <select value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} disabled={!branchId} className={inputCls}>
                    <option value="">— Pilih —</option>
                    {salespersons.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Tipe Harga</label>
                  <select value={saleType} onChange={(e) => setSaleType(e.target.value)} className={inputCls}>
                    <option value="retail">Retail</option>
                    <option value="grosir">Grosir</option>
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium mb-1.5">Metode Bayar</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                <option value="tunai">Tunai</option>
                <option value="kredit">Kredit</option>
              </select>
            </div>
            {paymentMethod === "kredit" && (
              <div>
                <label className="block text-sm font-medium mb-1.5">Jatuh Tempo</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
              </div>
            )}
            {paymentMethod === "tunai" && (
              <div className="text-[11px] text-muted-foreground self-end pb-2">Tunai: pilih rekening agar kas bergerak.</div>
            )}
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Item Transaksi</label>
              <button type="button" onClick={addItem} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4" /> Tambah Item
              </button>
            </div>
            <div className="rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">Produk</th>
                    <th className="text-right font-semibold px-3 py-2 w-20">Qty</th>
                    <th className="text-right font-semibold px-3 py-2 w-32">Harga</th>
                    <th className="text-right font-semibold px-3 py-2 w-32">Subtotal</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                        Belum ada item. Klik "Tambah Item".
                      </td>
                    </tr>
                  ) : (
                    items.map((it, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2">
                          <select value={it.product_id} onChange={(e) => updateItem(i, "product_id", e.target.value)} className={inputCls}>
                            <option value="">— Pilih Produk —</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ""}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="1" value={it.qty} onChange={(e) => updateItem(i, "qty", Number(e.target.value))} className={inputCls + " text-right"} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" value={it.price} onChange={(e) => updateItem(i, "price", Number(e.target.value))} className={inputCls + " text-right"} />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(it.subtotal)}</td>
                        <td className="px-2 py-2 text-center">
                          <button type="button" onClick={() => removeItem(i)} className="p-1 rounded-lg text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {items.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={3} className="px-3 py-2.5 text-right font-semibold">Total</td>
                      <td className="px-3 py-2.5 text-right font-bold text-base">{formatCurrency(total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Catatan</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 px-6 py-4 border-t border-border bg-card rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent">
            Batal
          </button>
          <button type="button" onClick={() => submit("draft")} disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent disabled:opacity-50">
            {submitting ? "Menyimpan..." : "Simpan Draft"}
          </button>
          <button type="button" onClick={() => submit("post")} disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? "Memproses..." : "Simpan & Posting"}
          </button>
        </div>
      </div>
    </div>
  );
}