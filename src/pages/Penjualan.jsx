import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import TransactionFormModal from "@/components/TransactionFormModal";
import TransactionDetailModal from "@/components/TransactionDetailModal";
import TransactionActionMenu from "@/components/TransactionActionMenu";
import { printTransaction } from "@/components/PrintTransaction";
import { postSale } from "@/lib/posting";
import { writeAuditLog } from "@/lib/audit";
import { formatCurrency, generateCode } from "@/lib/utils";

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

  const load = async () => {
    setLoading(true);
    try {
      const items = await base44.entities.Sale.list("-created_date", 500);
      setData(items || []);
    } catch (err) {
      toast({ title: "Gagal memuat data", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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
          const code = generateCode("PEN", data.length, 5);
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

  const handlePrint = (row) => {
    printTransaction(row, "sale");
  };

  const handleDelete = async (row) => {
    if (row.status === "posted") {
      toast({ title: "Transaksi posted tidak bisa dihapus", variant: "destructive" });
      return;
    }
    if (!confirm(`Hapus draft ${row.code}?`)) return;
    try {
      await base44.entities.Sale.delete(row.id);
      await writeAuditLog({ action: "delete_sale_draft", module: "penjualan", description: `Hapus draft ${row.code}`, branchId: row.branch_id });
      toast({ type: "success", title: "Draft dihapus" });
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
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={["code", "customer_name", "salesperson_name", "note"]}
        searchPlaceholder="Cari kode / pelanggan / sales..."
        rowActions={(row) => (
          <TransactionActionMenu
            row={row}
            onView={setViewing}
            onEdit={openEdit}
            onPost={handlePost}
            onPrint={handlePrint}
            onDelete={handleDelete}
          />
        )}
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