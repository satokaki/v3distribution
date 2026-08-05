# BACKLOG AUDIT — BELUM DIKERJAKAN

> Disimpan sesuai instruksi. Tidak dihapus, tidak dikerjakan sekarang.

## Ringkasan Audit Integritas Transaksi (fase sebelumnya)

### Bug Kritis
- Potensi race condition pada generate kode unik (sequence client-side via list count).
- Tidak ada atomicity pada transaksi posting (partial failure berisiko drift data).
  - Catatan: P0 penjualan & pembelian kini memiliki rollback kompensasi (posting.js).
- Stok bisa minus pada transaksi penjualan/mutasi.
  - Catatan: guard stok sudah ditambahkan ke stockPosting.js (P0).
- Beberapa transaksi keuangan (tunai/kredit) tidak menggerakkan kas/piutang/hutang secara otomatis.
  - Catatan: penjualan & pembelian sudah diintegrasikan (posting.js).
- Tidak ada rekonsiliasi otomatis antara saldo dan ledger.

### Modul yang Masih Perlu Patch (P0 lanjutan)
- Pelunasan Hutang (PayablePayment) belum membuat CashTransaction + update Account + kurangi Payable.paid_amount + Supplier.debt_balance.
- Pelunasan Piutang (ReceivablePayment) belum membuat CashTransaction + update Account + kurangi Receivable.paid_amount + Customer.receivable_balance.
- Bayar Komisi (Commission -> paid) belum membuat CashTransaction + update Account + set status paid.
- Mutasi Cabang (StockTransfer) belum diintegrasikan ke posting atomic (stok in/out dua cabang).
- Jual Beli Cabang (InterbranchTransaction): stok + kas/piutang/hutang antar cabang belum atomic.

### Modul Laporan (belum dibangun)
- Laporan Penjualan, Pembelian, Stok, Arus Kas, Laba Rugi.

### Catatan
- Backlog ini dipertahankan dan tidak dikerjakan dalam sesi ini.
- Prioritas saat ini: perbaikan bug navigasi menu (menu tidak berfungsi).