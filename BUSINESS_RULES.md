# POS Distribusi V3 — Locked Business Rules

Dokumen ini mencatat keputusan bisnis authoritative. Rule berstatus **LOCKED** hanya boleh diubah dengan persetujuan business owner.

## BR-TRANSFER-001 — Mutasi Antar Cabang

**Status:** LOCKED  
**Implementasi:** Tahap 4, hanya setelah Tahap 3B Kartu Stok berstatus VERIFIED.  
**Saat ini:** Dokumentasi saja; tidak mengubah kode, entity, stok, atau UI Mutasi.

### Lifecycle final

```text
draft → approved → received
```

Status `shipped` dilarang. Label `approved` boleh ditampilkan sebagai **Dikirim / Dalam Perjalanan**.

| Status | Stok asal | Stok tujuan | In transit |
|---|---:|---:|---:|
| `draft` | Tidak berubah | Tidak berubah | 0 |
| `approved` | Berkurang sebesar approved qty | Tidak berubah | Approved qty |
| `received` | Sudah berkurang saat approved | Bertambah sebesar received qty | 0 |

Draft hanya dokumen. Draft tidak boleh membuat StockBalance movement atau StockLedger.

Selama masih draft, user boleh mengubah cabang tujuan, produk, qty, dan catatan sesuai permission yang sudah berlaku.

### Approval

Perubahan `draft → approved` sekaligus berarti barang disetujui, dilepas dari stok cabang asal, dan berada dalam perjalanan. Tidak ada langkah `shipped`.

Backend wajib:

- menentukan source branch dari authenticated user dan mapping `UserBranch`;
- mengabaikan source branch dari frontend;
- memastikan destination valid dan berbeda dari source;
- memvalidasi produk, qty positif, dan kecukupan stok;
- mengembalikan error `INSUFFICIENT_STOCK` jika stok tidak cukup, tanpa membuat movement atau StockLedger parsial;
- mengurangi branch stock asal tepat satu kali;
- membuat ledger `transfer_out` tepat satu kali;
- menyimpan approved qty dan `in_transit_qty`;
- memakai idempotency key `approval_request_id`.

### Penerimaan

Perubahan `approved → received` hanya dapat dilakukan user dengan akses aktif ke destination branch.

Backend wajib:

- memastikan transfer masih `approved`;
- memvalidasi received qty;
- menambah branch stock tujuan sebesar received qty tepat satu kali;
- membuat ledger `transfer_in` tepat satu kali;
- menghitung `difference_qty = approved_qty - received_qty`;
- mengubah `in_transit_qty` menjadi 0;
- menyimpan penerima dan waktu penerimaan;
- memakai idempotency key `receiving_request_id`.

User source branch tidak boleh menerima transfer tanpa akses destination branch.

Pada form penerimaan, setiap item harus menampilkan qty dikirim dan input qty diterima. User destination branch boleh memasukkan qty fisik yang berbeda serta catatan penerimaan sebelum konfirmasi.

### Selisih mutasi

Sistem wajib menyimpan `approved_qty`, `received_qty`, dan `difference_qty`. Selisih tidak boleh otomatis dimasukkan ke cabang mana pun atau disembunyikan melalui stock adjustment otomatis.

### In transit bukan Warehouse

`in_transit_qty` adalah logical quantity pada StockTransfer, bukan lokasi fisik. Dilarang membuat Warehouse Transit, Gudang Transit, Transit Warehouse, atau entity Warehouse baru untuk perjalanan barang.

Dashboard pusat nantinya menghitung barang dalam perjalanan dari `status = approved` dan `in_transit_qty > 0`.

### Struktur cabang dan UI

Mutasi baru hanya menggunakan `source_branch_id` dan `destination_branch_id`. Source readonly berasal dari current user; user hanya memilih destination.

UI tidak boleh menampilkan gudang asal, gudang tujuan, atau warehouse selector. Destination branch mempunyai section **Mutasi Masuk** untuk transfer `approved`, dengan input received qty per item.

### Data minimal StockTransfer

Tahap 4 harus mendukung:

```text
transfer_number
source_branch_id
destination_branch_id
status
approved_at
approved_by
received_at
received_by
approved_qty
received_qty
difference_qty
in_transit_qty
notes
receiving_notes
approval_request_id
receiving_request_id
```

Untuk multi-item, qty dapat disimpan pada detail item. Field warehouse legacy tetap dipertahankan dan dibuat optional bila diperlukan; data historis tidak boleh dihapus.

Field qty di atas adalah kebutuhan informasi, bukan kewajiban penyimpanan pada header. Jika arsitektur existing memakai array/detail item, `approved_qty`, `received_qty`, `difference_qty`, dan `in_transit_qty` disimpan per item dan nilai header hanya boleh berupa agregat bila memang diperlukan.

### Cancel dan reversal

- Draft boleh dibatalkan tanpa movement stok.
- Transfer approved tidak boleh dihapus langsung.
- Pembatalan setelah approval, jika disetujui kemudian, wajib memakai reversal movement dan tidak boleh menghapus StockLedger.
- Flow void/cancel setelah approval belum final dan tidak boleh diimplementasikan sekarang.

### Acceptance criteria Tahap 4

- Hanya ada status `draft`, `approved`, dan `received`.
- Draft tetap dapat diedit sesuai permission existing dan tidak memengaruhi stok.
- Approval dan penerimaan idempotent.
- Tidak ada movement saat draft.
- `transfer_out` terjadi saat approved.
- `transfer_in` terjadi saat received.
- Selisih tersimpan dan dapat diaudit.
- Source branch berasal dari backend user mapping.
- Penerimaan dibatasi ke destination branch.
- Tidak ada warehouse transit atau selector warehouse.
- Data warehouse legacy tetap dapat dibaca.
- Stok tidak cukup menghasilkan `INSUFFICIENT_STOCK` tanpa ledger parsial.
- Form penerimaan mendukung qty diterima per item dan catatan penerimaan.
