import React, { useEffect, useMemo, useState } from "react";
import { X, Printer } from "lucide-react";
import { buildCode128Bars } from "@/lib/code128";

const DEFAULT_FORM = {
  product_code: "",
  sku: "",
  barcode: "",
  name: "",
  brand: "",
  category_id: "",
  subcategory: "",
  unit: "pcs",
  pack_size: 1,
  purchase_price: 0,
  retail_price: 0,
  grosir_price: 0,
  interbranch_price: 0,
  vvip_price: 0,
  min_stock: 0,
  sync_enabled: true,
  is_active: true,
};

function BarcodePreview({ value, name }) {
  const result = useMemo(() => {
    try {
      return { ...buildCode128Bars(value), error: "" };
    } catch (error) {
      return { bars: [], width: 1, error: error.message };
    }
  }, [value]);

  if (!value) return <div className="text-xs text-muted-foreground">Barcode belum diisi.</div>;
  if (result.error) return <div className="text-xs text-destructive">{result.error}</div>;

  return (
    <div className="inline-flex max-w-full flex-col items-center gap-1 rounded-lg border bg-white p-3">
      <svg
        viewBox={`0 0 ${result.width} 58`}
        width="240"
        height="58"
        preserveAspectRatio="none"
        className="max-w-full text-black"
        aria-label={`Barcode ${value}`}
      >
        {result.bars.map((bar, index) => (
          <rect key={index} x={bar.x} y="0" width={bar.width} height="58" fill="currentColor" />
        ))}
      </svg>
      <div className="font-mono text-[10px]">{value}</div>
      <div className="max-w-[260px] text-center text-[11px] font-semibold leading-tight">{name || "Nama Barang"}</div>
    </div>
  );
}

function Field({ label, children, full = false }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted disabled:text-muted-foreground";

export default function ProductFormModal({
  open,
  onClose,
  onSubmit,
  product,
  categories = [],
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...DEFAULT_FORM,
      ...(product || {}),
      unit: product?.unit === "pack" ? "pack" : "pcs",
      pack_size: product?.unit === "pack" ? Number(product?.pack_size || 1) : 1,
    });
  }, [open, product]);

  if (!open) return null;

  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const submit = async (event) => {
    event.preventDefault();

    if (!String(form.name || "").trim()) {
      alert("Nama Barang wajib diisi.");
      return;
    }

    if (form.unit === "pack" && Number(form.pack_size || 0) <= 0) {
      alert("Isi per Pack wajib lebih dari 0 PCS.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        ...form,
        name: String(form.name).trim(),
        brand: String(form.brand || "").trim(),
        barcode: String(form.barcode || "").trim(),
        pack_size: form.unit === "pack" ? Number(form.pack_size) : 1,
      });
    } finally {
      setSaving(false);
    }
  };

  const printCurrentBarcode = () => {
    if (!form.barcode) {
      alert("Barcode belum diisi.");
      return;
    }

    let data;
    try {
      data = buildCode128Bars(form.barcode);
    } catch (error) {
      alert(error.message);
      return;
    }

    const rects = data.bars
      .map((bar) => `<rect x="${bar.x}" y="0" width="${bar.width}" height="58" fill="#000"/>`)
      .join("");

    const win = window.open("", "_blank", "width=520,height=420");
    if (!win) return alert("Popup cetak diblokir browser.");

    const safe = (v) =>
      String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

    win.document.write(`<!doctype html>
      <html><head><title>Barcode ${safe(form.name)}</title>
      <style>
        @page{margin:5mm}
        body{font-family:Arial,sans-serif;margin:0;padding:10mm}
        .label{width:65mm;margin:auto;text-align:center}
        svg{width:58mm;height:18mm}
        .code{font:10px monospace;margin-top:2mm}
        .name{font-size:11px;font-weight:700;line-height:1.25;margin-top:2mm}
      </style></head>
      <body><div class="label">
        <svg viewBox="0 0 ${data.width} 58" preserveAspectRatio="none">${rects}</svg>
        <div class="code">${safe(form.barcode)}</div>
        <div class="name">${safe(form.name)}</div>
      </div><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-bold">{product ? "Edit Barang" : "Tambah Barang"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Master barang terpusat V3 Distribution.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-150px)] overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="ID Barang">
              <input className={inputClass} value={form.product_code || ""} disabled placeholder="Otomatis" />
            </Field>

            <Field label="SKU">
              <input className={inputClass} value={form.sku || ""} disabled placeholder="Otomatis" />
            </Field>

            <Field label="Barcode">
              <input className={inputClass} value={form.barcode || ""} onChange={(e) => set("barcode", e.target.value)} />
            </Field>

            <Field label="Nama Barang">
              <input className={inputClass} value={form.name || ""} onChange={(e) => set("name", e.target.value)} required />
            </Field>

            <Field label="Merek">
              <input className={inputClass} value={form.brand || ""} onChange={(e) => set("brand", e.target.value)} />
            </Field>

            <Field label="Kategori">
              <select className={inputClass} value={form.category_id || ""} onChange={(e) => set("category_id", e.target.value)}>
                <option value="">Pilih kategori</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Subkategori">
              <input className={inputClass} value={form.subcategory || ""} onChange={(e) => set("subcategory", e.target.value)} />
            </Field>

            <Field label="Satuan">
              <select className={inputClass} value={form.unit} onChange={(e) => set("unit", e.target.value)}>
                <option value="pcs">PCS</option>
                <option value="pack">PACK</option>
              </select>
            </Field>

            {form.unit === "pack" ? (
              <Field label="1 PACK Isi Berapa PCS">
                <div className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    type="number"
                    min="1"
                    step="1"
                    value={form.pack_size}
                    onChange={(e) => set("pack_size", e.target.value)}
                    required
                  />
                  <span className="whitespace-nowrap text-sm font-medium">PCS</span>
                </div>
              </Field>
            ) : null}

            <Field label="HBT">
              <input className={inputClass} type="number" value={form.purchase_price ?? 0} disabled />
            </Field>

            <Field label="MSRP">
              <input className={inputClass} type="number" min="0" value={form.retail_price ?? 0} onChange={(e) => set("retail_price", Number(e.target.value))} />
            </Field>

            <Field label="WHOLESALE">
              <input className={inputClass} type="number" min="0" value={form.grosir_price ?? 0} onChange={(e) => set("grosir_price", Number(e.target.value))} />
            </Field>

            <Field label="VIP">
              <input className={inputClass} type="number" min="0" value={form.interbranch_price ?? 0} onChange={(e) => set("interbranch_price", Number(e.target.value))} />
            </Field>

            <Field label="VVIP">
              <input className={inputClass} type="number" min="0" value={form.vvip_price ?? 0} onChange={(e) => set("vvip_price", Number(e.target.value))} />
            </Field>

            <Field label="Minimum Stok">
              <input className={inputClass} type="number" min="0" value={form.min_stock ?? 0} onChange={(e) => set("min_stock", Number(e.target.value))} />
            </Field>

            <Field label="Sinkron Antar Cabang">
              <label className="flex h-10 items-center gap-2 rounded-lg border px-3">
                <input type="checkbox" checked={Boolean(form.sync_enabled)} onChange={(e) => set("sync_enabled", e.target.checked)} />
                <span className="text-sm">{form.sync_enabled ? "Aktif" : "Nonaktif"}</span>
              </label>
            </Field>

            <Field label="Status Aktif">
              <label className="flex h-10 items-center gap-2 rounded-lg border px-3">
                <input type="checkbox" checked={Boolean(form.is_active)} onChange={(e) => set("is_active", e.target.checked)} />
                <span className="text-sm">{form.is_active ? "Aktif" : "Nonaktif"}</span>
              </label>
            </Field>

            <Field label="Preview Barcode" full>
              <div className="flex flex-wrap items-end gap-3">
                <BarcodePreview value={form.barcode} name={form.name} />
                <button
                  type="button"
                  onClick={printCurrentBarcode}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-accent"
                >
                  <Printer className="h-4 w-4" />
                  Cetak Barcode
                </button>
              </div>
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/20 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium">
            Batal
          </button>
          <button disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {saving ? "Menyimpan..." : product ? "Simpan Perubahan" : "Tambah Barang"}
          </button>
        </div>
      </form>
    </div>
  );
}
