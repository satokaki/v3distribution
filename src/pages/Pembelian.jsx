import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import TransactionFormModal from "@/components/TransactionFormModal";
import { applyStockMovement } from "@/lib/stockPosting";
import { formatCurrency, generateCode } from "@/lib/utils";

const selectCls = "px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

function StatusBadge({ value }) {
  const map = {
    draft: "bg-amber-100 text-amber-700",
    posted: "bg-emerald-100 text-emerald-700",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[value] || "bg-muted text-muted-foreground"}`}>{value}</span>;
}

export default function Pembelian() {
  const { toast } = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const items = await base44.entities.Purchase.list("-created_date", 500);
      setData(items || []);
    } catch {
      toast({ title: "Gagal memuat data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (payload, action) => {
    const code = generateCode("PMB", data.length, 5);
    const status = action === "post" ? "posted" : "draft";
    const created = await base44.entities.Purchase.create({ ...payload, code, status });

    if (action === "post") {
      const branch = { id: payload.branch_id, code: payload.branch_code };
      const warehouse = { id: payload.warehouse_id, name: payload.warehouse_name };
      for (const item of payload.items || []) {
        await applyStockMovement({
          product: { product_id: item.product_id, product_name: item.product_name, sku: item.sku },
          branch,
          warehouse,
          type: "in",
          qty: item.qty,
          refType: "purchase",
          refId: created.id,
          refCode: code,
          note: `Pembelian ${code}`,
        });
      }
      toast({ title: "Pembelian diposting & stok masuk diperbarui" });
    } else {
      toast({ title: "Draft pembelian disimpan" });
    }

    setModalOpen(false);
    await load();
  };

  const handleDelete = async (row) => {
    if (row.status === "posted") {
      toast({ title: "Transaksi posted tidak bisa dihapus", variant: "destructive" });
      return;
    }
    await base44.entities.Purchase.delete(row.id);
    toast({ title: "Draft dihapus" });
    await load();
  };

  const columns = [
    { key: "code", label: "Kode", className: "font-medium" },
    { key: "date", label: "Tanggal", render: (v) => (v ? v.slice(0, 10) : "—") },
    { key: "supplier_name", label: "Supplier" },
    { key: "warehouse_name", label: "Gudang" },
    { key: "total", label: "Total", render: (v) => formatCurrency(v || 0), className: "text-right" },
    { key: "status", label: "Status", render: (v) => <StatusBadge value={v} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Pembelian"
        subtitle="Transaksi pembelian barang dari supplier"
        action={
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            + Pembelian Baru
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={["code", "supplier_name"]}
        searchPlaceholder="Cari kode / supplier..."
        rowActions={(row) => (
          <button
            onClick={() => handleDelete(row)}
            className="px-2 py-1 text-xs rounded-lg text-destructive hover:bg-destructive/10"
          >
            Hapus
          </button>
        )}
      />
      <TransactionFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        type="purchase"
      />
    </div>
  );
}