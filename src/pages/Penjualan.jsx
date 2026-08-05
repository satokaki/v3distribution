import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import TransactionFormModal from "@/components/TransactionFormModal";
import TransactionDetailModal from "@/components/TransactionDetailModal";
import TransactionActionMenu from "@/components/TransactionActionMenu";
import TransactionFilters from "@/components/TransactionFilters";
import TransactionPrintPreview from "@/components/TransactionPrintPreview";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Search } from "lucide-react";
import { postSale } from "@/lib/posting";
import { writeAuditLog } from "@/lib/audit";
import { generateDailyCode } from "@/lib/transactionCode";
import { formatCurrency } from "@/lib/utils";

function StatusBadge({ value }) {
  const map = {
    draft: "bg-amber-100 text-amber-700",
    posted: "bg-emerald-100 text-emerald-700",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[value] || "bg-muted text-muted-foreground"}`}>{value}</span>;
}

export default function Penjualan() {
  const { toast } = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [filters, setFilters] = useState({ status: "", payment: "", salespersonId: "", partnerName: "", itemName: "", categoryId: "", dateFrom: "", dateTo: "" });
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [productMap, setProductMap] = useState({});
  const [receivableSettled, setReceivableSettled] = useState({});
  const [salespersons, setSalespersons] = useState([]);
  const [categories, setCategories] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [items, products, sps, cats, recvs] = await Promise.all([
        base44.entities.Sale.list("-created_date", 500),
        base44.entities.Product.list("-created_date", 500),
        base44.entities.Salesperson.list("-created_date", 500),
        base44.entities.ProductCategory.list("-created_date", 500),
        base44.entities.Receivable.filter({ source: "sale" }),
      ]);
      setData(items || []);
      setProductMap(Object.fromEntries((products || []).map((p) => [p.id, p])));
      setSalespersons(sps || []);
      setCategories(cats || []);
      const settled = {};
      (recvs || []).forEach((rv) => { settled[rv.ref_id] = rv.status === "paid"; });
      setReceivableSettled(settled);
    } catch (err) {
      toast({ title: "Gagal memuat data", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(keyword), 300);
    return () => clearTimeout(t);
  }, [keyword]);

  const filtered = useMemo(() => {
    const kw = debouncedKeyword.toLowerCase().trim();
    return data.filter((r) => {
      if (filters.status && r.status !== filters.status) return false;
      const d = (r.date || "").slice(0, 10);
      if (filters.dateFrom && d < filters.dateFrom) return false;
      if (filters.dateTo && d > filters.dateTo) return false;
      if (filters.salespersonId && r.salesperson_id !== filters.salespersonId) return false;
      if (filters.partnerName && !((r.customer_name || "").toLowerCase().includes(filters.partnerName.toLowerCase()))) return false;
      if (filters.payment) {
        const pm = r.payment_method;
        const settled = receivableSettled[r.id];
        let ok = false;
        if (filters.payment === "tunai") ok = pm === "tunai";
        else if (filters.payment === "kredit") ok = pm === "kredit";
        else if (filters.payment === "lunas") ok = pm === "tunai" || (pm === "kredit" && settled);
        else if (filters.payment === "belum_lunas") ok = pm === "kredit" && !settled;
        if (!ok) return false;
      }
      if (filters.categoryId && !((r.items || []).some((it) => productMap[it.product_id]?.category_id === filters.categoryId))) return false;
      if (filters.itemName) {
        const q = filters.itemName.toLowerCase();
        if (!((r.items || []).some((it) => (it.product_name || "").toLowerCase().includes(q)))) return false;
      }
      if (kw) {
        const matchHeader =
          (r.code || "").toLowerCase().includes(kw) ||
          (r.customer_name || "").toLowerCase().includes(kw) ||
          (r.salesperson_name || "").toLowerCase().includes(kw) ||
          (r.note || "").toLowerCase().includes(kw);
        const matchItems = (r.items || []).some((it) => {
          const p = productMap[it.product_id];
          return (it.product_name || "").toLowerCase().includes(kw) ||
            (it.sku || "").toLowerCase().includes(kw) ||
            (p?.sku || "").toLowerCase().includes(kw) ||
            (p?.barcode || "").toLowerCase().includes(kw);
        });
        if (!matchHeader && !matchItems) return false;
      }
      return true;
    });
  }, [data, filters, debouncedKeyword, productMap, receivableSettled]);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setModalOpen(true);
  };

  const handleSubmit = async (payload, action, editingId) => {
    try {
      if (action === "post") {
        await postSale(payload);
        if (editingId) {
          await base44.entities.Sale.delete(editingId);
        }
        await writeAuditLog({ action: "post_sale", module: "penjualan", description: `Posting penjualan dari draft`, branchId: payload.branch_id });
        toast({ type: "success", title: "Penjualan diposting", description: "Stok, kas/piutang & komisi diperbarui" });
      } else {
        if (editingId) {
          await base44.entities.Sale.update(editingId, { ...payload, status: "draft" });
          await writeAuditLog({ action: "update_sale_draft", module: "penjualan", description: `Edit draft penjualan`, branchId: payload.branch_id });
          toast({ type: "success", title: "Draft penjualan diperbarui" });
        } else {
          const code = await generateDailyCode("Sale", "PEN", payload.date);
          await base44.entities.Sale.create({ ...payload, code, status: "draft" });
          await writeAuditLog({ action: "create_sale_draft", module: "penjualan", description: `Draft penjualan ${code}`, branchId: payload.branch_id });
          toast({ type: "success", title: "Draft penjualan disimpan" });
        }
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast({ title: "Gagal menyimpan penjualan", description: err.message, variant: "destructive" });
    }
  };

  const handlePost = async (row) => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      await postSale(row);
      await base44.entities.Sale.delete(row.id);
      await writeAuditLog({ action: "post_sale", module: "penjualan", description: `Posting draft ${row.code}`, branchId: row.branch_id });
      toast({ type: "success", title: "Penjualan diposting", description: `${row.code} → posted` });
      await load();
    } catch (err) {
      toast({ title: "Gagal posting", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handlePreview = (row) => setPreview(row);

  const handleDelete = (row) => {
    if (row.status === "posted") {
      toast({ title: "Invoice posted tidak bisa dihapus. Gunakan Void.", variant: "destructive" });
      return;
    }
    setConfirmTarget(row);
  };

  const confirmDelete = async () => {
    const row = confirmTarget;
    if (!row) return;
    try {
      await base44.entities.Sale.delete(row.id);
      await writeAuditLog({ action: "delete_sale_draft", module: "penjualan", description: `Hapus draft ${row.code}`, branchId: row.branch_id });
      toast({ type: "success", title: `Draft ${row.code} dihapus` });
      setConfirmTarget(null);
      await load();
    } catch (err) {
      toast({ title: "Gagal menghapus", description: err.message, variant: "destructive" });
    }
  };

  const columns = [
    { key: "code", label: "Kode", className: "font-medium" },
    { key: "date", label: "Tanggal", render: (v) => (v ? v.slice(0, 10) : "—") },
    { key: "customer_name", label: "Pelanggan" },
    { key: "salesperson_name", label: "Sales", render: (v) => v || "—" },
    { key: "sale_type", label: "Tipe", render: (v) => (v ? <span className="capitalize">{v}</span> : "—") },
    { key: "payment_method", label: "Bayar", render: (v) => v ? <span className="capitalize">{v}</span> : "—" },
    { key: "total", label: "Total", render: (v) => formatCurrency(v || 0), className: "text-right" },
    { key: "status", label: "Status", render: (v) => <StatusBadge value={v} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Penjualan"
        subtitle="Transaksi penjualan retail & grosir"
        action={
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            + Penjualan Baru
          </button>
        }
      />
      <div className="relative max-w-xl mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Cari invoice / pelanggan / sales / barang / SKU / barcode / catatan..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <TransactionFilters
        mode="sale"
        salespersons={salespersons}
        categories={categories}
        onApply={setFilters}
      />
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchKeys={[]}
        rowActions={(row) => (
          <TransactionActionMenu
            row={row}
            onView={setViewing}
            onEdit={openEdit}
            onPost={handlePost}
            onPreview={handlePreview}
            onDelete={handleDelete}
          />
        )}
      />
      <TransactionPrintPreview
        open={!!preview}
        onClose={() => setPreview(null)}
        transaction={preview}
        documentType="sale"
        isDraft={preview?.status === "draft"}
      />
      <ConfirmDialog
        open={!!confirmTarget}
        title={confirmTarget ? `Hapus draft invoice ${confirmTarget.code}?` : ""}
        description="Data draft dan seluruh item di dalamnya akan dihapus. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
      <TransactionFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSubmit={handleSubmit}
        type="sale"
        editing={editing}
      />
      <TransactionDetailModal
        open={!!viewing}
        onClose={() => setViewing(null)}
        data={viewing}
        type="sale"
      />
    </div>
  );
}