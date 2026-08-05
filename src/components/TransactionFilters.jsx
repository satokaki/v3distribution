import React, { useState } from "react";

const inputCls =
  "w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

const EMPTY = {
  status: "",
  payment: "",
  salespersonId: "",
  partnerName: "",
  itemName: "",
  categoryId: "",
  dateFrom: "",
  dateTo: "",
};

/**
 * Filter bar transaksi: status, status pembayaran, sales/supplier, pelanggan,
 * nama barang, kategori, rentang tanggal. Tombol Terapkan + Reset Filter.
 */
export default function TransactionFilters({ mode, salespersons = [], categories = [], onApply }) {
  const [draft, setDraft] = useState(EMPTY);
  const isPurchase = mode === "purchase";

  const set = (k) => (e) => setDraft((s) => ({ ...s, [k]: e.target.value }));
  const apply = () => onApply(draft);
  const reset = () => {
    setDraft(EMPTY);
    onApply(EMPTY);
  };

  return (
    <div className="mb-3 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Status">
          <select value={draft.status} onChange={set("status")} className={inputCls}>
            <option value="">Semua</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
          </select>
        </Field>
        <Field label="Status Pembayaran">
          <select value={draft.payment} onChange={set("payment")} className={inputCls}>
            <option value="">Semua Pembayaran</option>
            <option value="tunai">Tunai</option>
            <option value="kredit">Kredit</option>
            <option value="belum_lunas">Belum Lunas</option>
            <option value="lunas">Lunas</option>
          </select>
        </Field>
        {!isPurchase && (
          <Field label="Sales">
            <select value={draft.salespersonId} onChange={set("salespersonId")} className={inputCls}>
              <option value="">Semua Sales</option>
              {salespersons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label={isPurchase ? "Supplier" : "Pelanggan"}>
          <input value={draft.partnerName} onChange={set("partnerName")} placeholder="Nama..." className={inputCls} />
        </Field>
        <Field label="Nama Barang">
          <input value={draft.itemName} onChange={set("itemName")} placeholder="Nama barang..." className={inputCls} />
        </Field>
        <Field label="Kategori">
          <select value={draft.categoryId} onChange={set("categoryId")} className={inputCls}>
            <option value="">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Dari Tanggal">
          <input type="date" value={draft.dateFrom} onChange={set("dateFrom")} className={inputCls} />
        </Field>
        <Field label="Sampai Tanggal">
          <input type="date" value={draft.dateTo} onChange={set("dateTo")} className={inputCls} />
        </Field>
      </div>
      <div className="flex gap-2">
        <button
          onClick={apply}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Terapkan
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-accent"
        >
          Reset Filter
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}