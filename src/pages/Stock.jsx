import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";

export default function Stock() {
  const { toast } = useToast();
  const [data, setData] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Branch.list().then((r) => setBranches(r || []));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const items = branchId
        ? await base44.entities.StockBalance.filter({ branch_id: branchId }, "-created_date", 500)
        : await base44.entities.StockBalance.list("-created_date", 500);
      setData(items || []);
    } catch {
      toast({ title: "Gagal memuat stok", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId]);

  const columns = [
    { key: "sku", label: "SKU", className: "font-medium" },
    { key: "product_name", label: "Nama Produk" },
    { key: "branch_code", label: "Cabang", render: (v) => v || "—" },
    { key: "warehouse_name", label: "Gudang" },
    { key: "quantity", label: "Qty", render: (v) => v ?? 0, className: "text-right font-medium" },
    { key: "min_stock", label: "Min", render: (v) => v ?? 0, className: "text-right text-muted-foreground" },
    {
      key: "status",
      label: "Status",
      render: (_, row) => {
        const low = (row.min_stock || 0) > 0 && (row.quantity || 0) <= (row.min_stock || 0);
        return (
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              low ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {low ? "Menipis" : "Aman"}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stok"
        subtitle="Saldo stok per produk per gudang"
        action={
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-input bg-background">
            <option value="">Semua Cabang</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={["sku", "product_name"]}
        searchPlaceholder="Cari SKU / produk..."
      />
    </div>
  );
}