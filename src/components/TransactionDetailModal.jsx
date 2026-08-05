import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { formatCurrency } from "@/lib/utils";

function StatusBadge({ value }) {
  const map = {
    draft: "bg-amber-100 text-amber-700",
    posted: "bg-emerald-100 text-emerald-700",
    void: "bg-rose-100 text-rose-700",
    cancelled: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[value] || "bg-muted text-muted-foreground"}`}>
      {value}
    </span>
  );
}

export default function TransactionDetailModal({ open, onClose, data, type }) {
  const isPurchase = type === "purchase";
  const [partner, setPartner] = useState(null);

  useEffect(() => {
    if (!open || !data) return;
    setPartner(null);
    const pid = isPurchase ? data.supplier_id : data.customer_id;
    if (!pid) return;
    const entity = isPurchase ? base44.entities.Supplier : base44.entities.Customer;
    entity.filter({ id: pid }).then((r) => setPartner(r && r[0])).catch(() => {});
  }, [open, data, isPurchase]);

  if (!open || !data) return null;

  const items = data.items || [];
  const createdDate = data.created_date ? new Date(data.created_date).toLocaleString("id-ID") : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-card rounded-2xl shadow-2xl border border-border">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Detail {isPurchase ? "Pembelian" : "Penjualan"}</h2>
            <StatusBadge value={data.status} />
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Info label="Nomor" value={data.code} />
            <Info label="Tanggal" value={data.date ? data.date.slice(0, 10) : "—"} />
            {!isPurchase && <Info label="Jenis" value={data.sale_type || "—"} className="capitalize" />}
            <Info label="Dibuat" value={createdDate} />
            <Info label="Gudang" value={data.warehouse_name || "—"} />
            <Info label="Cabang" value={data.branch_code || "—"} />
          </div>

          {/* Pihak terkait */}
          <div className="rounded-xl border border-border p-4 space-y-1 text-sm">
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
              {isPurchase ? "Supplier" : "Pelanggan"}
            </div>
            <div className="font-medium">{isPurchase ? data.supplier_name : data.customer_name}</div>
            {partner?.phone && <div className="text-muted-foreground">Telp: {partner.phone}</div>}
            {partner?.address && <div className="text-muted-foreground">{partner.address}</div>}
            {!isPurchase && data.salesperson_name && (
              <div className="text-muted-foreground">Sales: {data.salesperson_name}</div>
            )}
          </div>

          {/* Items */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">SKU</th>
                  <th className="text-left font-semibold px-3 py-2">Nama Barang</th>
                  <th className="text-right font-semibold px-3 py-2 w-20">Qty</th>
                  <th className="text-right font-semibold px-3 py-2 w-32">Harga</th>
                  <th className="text-right font-semibold px-3 py-2 w-32">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Tidak ada item</td></tr>
                ) : (
                  items.map((it, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground">{it.sku || "—"}</td>
                      <td className="px-3 py-2">{it.product_name || "—"}</td>
                      <td className="px-3 py-2 text-right">{it.qty}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(it.price)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(it.subtotal)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30">
                  <td colSpan={4} className="px-3 py-2.5 text-right font-semibold">Total</td>
                  <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(data.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pembayaran */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <Info label="Metode Bayar" value={data.payment_method || "—"} className="capitalize" />
            <Info label="Rekening" value={data.account_name || "—"} />
            {data.payment_method === "kredit" && <Info label="Jatuh Tempo" value={data.due_date ? data.due_date.slice(0, 10) : "—"} />}
          </div>

          {data.note && (
            <div className="text-sm">
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Catatan</div>
              <div className="whitespace-pre-wrap">{data.note}</div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 px-6 py-4 border-t border-border bg-card rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, className = "" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-medium ${className}`}>{value || "—"}</div>
    </div>
  );
}