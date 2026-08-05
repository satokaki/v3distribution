import { formatCurrency } from "@/lib/utils";

/**
 * Cetak transaksi via print window HTML.
 * type: "sale" | "purchase"
 */
export function printTransaction(data, type) {
  if (!data) return;
  const isPurchase = type === "purchase";
  const items = data.items || [];
  const entityName = "V3 Distribution";
  const docTitle = isPurchase ? "Dokumen Pembelian" : data.sale_type === "grosir" ? "Invoice Grosir" : "Nota Penjualan";

  const rows = items.map((it, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${it.sku || ""}</td>
      <td>${it.product_name || ""}</td>
      <td style="text-align:right">${it.qty || 0}</td>
      <td style="text-align:right">${formatCurrency(it.price)}</td>
      <td style="text-align:right">${formatCurrency(it.subtotal)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>${docTitle} ${data.code || ""}</title>
<style>
  * { font-family: Arial, Helvetica, sans-serif; }
  body { padding: 24px; color: #111; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:12px; margin-bottom:16px; }
  .brand { font-size:20px; font-weight:bold; }
  .muted { color:#555; font-size:12px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }
  th, td { border:1px solid #ddd; padding:8px; }
  th { background:#f3f4f6; text-align:left; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; font-size:13px; margin-bottom:12px; }
  .total { margin-top:12px; text-align:right; font-size:16px; font-weight:bold; }
  .sign { margin-top:48px; display:flex; justify-content:space-between; font-size:13px; }
  .sign div { text-align:center; }
  @media print { .noprint { display:none; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">${entityName}</div>
      <div class="muted">Sistem Distribusi</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:16px; font-weight:bold">${docTitle}</div>
      <div class="muted">No: ${data.code || ""}</div>
      <div class="muted">Tanggal: ${data.date ? data.date.slice(0, 10) : "-"}</div>
      <div class="muted">Status: ${(data.status || "").toUpperCase()}</div>
    </div>
  </div>

  <div class="meta">
    <div><strong>${isPurchase ? "Supplier" : "Pelanggan"}:</strong> ${isPurchase ? (data.supplier_name || "-") : (data.customer_name || "-")}</div>
    <div><strong>Gudang:</strong> ${data.warehouse_name || "-"}</div>
    ${!isPurchase && data.salesperson_name ? `<div><strong>Sales:</strong> ${data.salesperson_name}</div>` : ""}
    <div><strong>Metode Bayar:</strong> <span style="text-transform:capitalize">${data.payment_method || "-"}</span></div>
    ${data.payment_method === "kredit" ? `<div><strong>Jatuh Tempo:</strong> ${data.due_date ? data.due_date.slice(0,10) : "-"}</div>` : ""}
    <div><strong>Rekening:</strong> ${data.account_name || "-"}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th>SKU</th>
        <th>Nama Barang</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">Harga</th>
        <th style="text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="6" style="text:center">Tidak ada item</td></tr>`}</tbody>
  </table>

  <div class="total">Total: ${formatCurrency(data.total)}</div>

  ${data.note ? `<div style="margin-top:16px"><strong>Catatan:</strong><div>${data.note}</div></div>` : ""}

  <div class="sign">
    <div>
      <div>Diterima oleh,</div>
      <div style="margin-top:48px">(....................)</div>
    </div>
    <div>
      <div>Hormat kami,</div>
      <div style="margin-top:48px">(....................)</div>
    </div>
  </div>

  <div class="noprint" style="margin-top:24px; text-align:center">
    <button onclick="window.print()" style="padding:8px 16px">Cetak</button>
    <button onclick="window.close()" style="padding:8px 16px;margin-left:8px">Tutup</button>
  </div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=820,height=720");
  if (!w) {
    alert("Pop-up diblokir. Izinkan pop-up untuk mencetak.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}