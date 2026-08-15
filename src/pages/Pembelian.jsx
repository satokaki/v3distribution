import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import TransactionFormModal from "@/components/TransactionFormModal";
import TransactionDetailModal from "@/components/TransactionDetailModal";
import TransactionActionMenu from "@/components/TransactionActionMenu";
import TransactionFilters from "@/components/TransactionFilters";
import { printTransaction } from "@/components/PrintTransaction";
import { postPurchase } from "@/lib/posting";
import { deletePurchaseDraft, savePurchaseDraft } from "@/lib/purchaseDraft";
import { writeAuditLog } from "@/lib/audit";
import { generateDailyCode } from "@/lib/transactionCode";
import { formatCurrency } from "@/lib/utils";
import { useBranchContext } from "@/lib/BranchContext";
import { Link } from "react-router-dom";

function StatusBadge({ value }) {
  const map = {
    draft: "bg-amber-100 text-amber-700",
    posted: "bg-emerald-100 text-emerald-700",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[value] || "bg-muted text-muted-foreground"}`}>{value}</span>;
}

export default function Pembelian() {
  const { activeBranchId, isAllBranches } = useBranchContext();
  const { toast } = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const items = await base44.entities.Purchase.list("-created_date", 500);
      const scoped = isAllBranches ? (items || []) : (items || []).filter((item) => item.branch_id === activeBranchId);
      setData(scoped.filter((item) => item.status !== "draft"));
    } catch {
      toast({ title: "Gagal memuat data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeBranchId, isAllBranches]);

  const filtered = useMemo(() => {
    return data.filter((r) => {
      const d = (r.date || "").slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }, [data, dateFrom, dateTo, status]);

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
        await postPurchase(payload);
        if (editingId) {
          await deletePurchaseDraft(editingId);
        }
        await writeAuditLog({ action: "post_purchase", module: "pembelian", description: `Posting pembelian dari draft`, branchId: payload.branch_id });
        toast({ type: "success", title: "Pembelian diposting", description: "Stok, kas/hutang & harga beli diperbarui" });
      } else {
        if (editingId) {
          await savePurchaseDraft({ ...payload, purchase_id: editingId });
          await writeAuditLog({ action: "update_purchase_draft", module: "pembelian", description: `Edit draft pembelian`, branchId: payload.branch_id });
          toast({ type: "success", title: "Draft pembelian diperbarui" });
        } else {
          const code = await generateDailyCode("Purchase", "PMB", payload.date);
          await savePurchaseDraft({ ...payload, code });
          await writeAuditLog({ action: "create_purchase_draft", module: "pembelian", description: `Draft pembelian ${code}`, branchId: payload.branch_id });
          toast({ type: "success", title: "Draft pembelian disimpan" });
        }
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast({ title: "Gagal menyimpan pembelian", description: err.message, variant: "destructive" });
    }
  };

  const handlePost = async (row) => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      await postPurchase(row);
      await deletePurchaseDraft(row.id);
      await writeAuditLog({ action: "post_purchase", module: "pembelian", description: `Posting draft ${row.code}`, branchId: row.branch_id });
      toast({ type: "success", title: "Pembelian diposting", description: `${row.code} → posted` });
      await load();
    } catch (err) {
      toast({ title: "Gagal posting", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handlePrint = (row) => printTransaction(row, "purchase");

  const handleDelete = async (row) => {
    if (row.status === "posted") {
      toast({ title: "Transaksi posted tidak bisa dihapus", variant: "destructive" });
      return;
    }
    if (!confirm(`Hapus draft ${row.code}?`)) return;
    try {
      await deletePurchaseDraft(row.id);
      await writeAuditLog({ action: "delete_purchase_draft", module: "pembelian", description: `Hapus draft ${row.code}`, branchId: row.branch_id });
      toast({ type: "success", title: "Draft dihapus" });
      await load();
    } catch (err) {
      toast({ title: "Gagal menghapus", description: err.message, variant: "destructive" });
    }
  };

  const columns = [
    { key: "code", label: "Kode", className: "font-medium" },
    { key: "date", label: "Tanggal", render: (v) => (v ? v.slice(0, 10) : "—") },
    { key: "supplier_name", label: "Supplier" },
    { key: "warehouse_name", label: "Gudang" },
    { key: "payment_method", label: "Bayar", render: (v) => v ? <span className="capitalize">{v}</span> : "—" },
    { key: "total", label: "Total", render: (v) => formatCurrency(v || 0), className: "text-right" },
    { key: "status", label: "Status", render: (v) => <StatusBadge value={v} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Laporan Pembelian"
        subtitle="Pencarian, monitoring, dan audit transaksi pembelian"
        action={
          <Link
            to="/pembelian"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            + Pembelian Baru
          </Link>
        }
      />
      <TransactionFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
        status={status}
        onStatus={setStatus}
        statusOptions={[{ value: "draft", label: "Draft" }, { value: "posted", label: "Posted" }]}
        onClear={() => { setDateFrom(""); setDateTo(""); setStatus(""); }}
      />
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchKeys={["code", "supplier_name", "note"]}
        searchPlaceholder="Cari kode / supplier..."
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
        type="purchase"
        editing={editing}
      />
      <TransactionDetailModal
        open={!!viewing}
        onClose={() => setViewing(null)}
        data={viewing}
        type="purchase"
      />
    </div>
  );
}
