import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import { useBranchContext } from "@/lib/BranchContext";
import { resolveBranchInventory } from "@/lib/branchStockBalanceCore";
import { formatCurrency } from "@/lib/utils";

const TYPES = ["Semua", "Liquid", "Device", "Cartridge", "Aksesoris"];
const normalizeType = (value = "") => {
  const type = value.toLowerCase();
  if (type.includes("liquid")) return "Liquid";
  if (type.includes("device")) return "Device";
  if (type.includes("cartridge") || type.includes("catridge")) return "Cartridge";
  if (type.includes("aksesor")) return "Aksesoris";
  return value || "Lainnya";
};

export default function Stock() {
  const { toast } = useToast();
  const { activeBranchId, isSuperAdmin, accessibleBranches } = useBranchContext();
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [type, setType] = useState("Semua");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSuperAdmin) setSelectedBranchId(activeBranchId || "");
    else if (activeBranchId && activeBranchId !== "all") setSelectedBranchId(activeBranchId);
  }, [activeBranchId, isSuperAdmin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const scopeBranchId = isSuperAdmin ? selectedBranchId : activeBranchId;
        const [balances, products, branchRows] = await Promise.all([
          scopeBranchId ? base44.entities.StockBalance.filter({ branch_id: scopeBranchId }, "product_name", 5000) : base44.entities.StockBalance.list("product_name", 5000),
          base44.entities.Product.list("name", 5000),
          isSuperAdmin ? base44.entities.Branch.list("name", 500) : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setBranches(branchRows || []);
          const allowed = isSuperAdmin ? (scopeBranchId ? [scopeBranchId] : null) : [activeBranchId];
          setRows(resolveBranchInventory({ balances: balances || [], products: products || [], branchIds: allowed }));
        }
      } catch (error) { toast({ title: "Gagal memuat inventory", description: error.message, variant: "destructive" }); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [activeBranchId, isSuperAdmin, selectedBranchId, toast]);

  const branchNames = useMemo(() => new Map((isSuperAdmin ? branches : accessibleBranches).map((branch) => [branch.id || branch.branch_id, branch.name || branch.branch_name])), [branches, accessibleBranches, isSuperAdmin]);
  const filtered = useMemo(() => rows.filter((row) => type === "Semua" || normalizeType(row.product_type) === type), [rows, type]);
  const totalValue = useMemo(() => filtered.reduce((sum, row) => sum + row.inventory_value, 0), [filtered]);
  const columns = [
    { key: "sku", label: "SKU", className: "font-medium" },
    { key: "product_name", label: "Produk" },
    { key: "category_name", label: "Kategori", render: (value, row) => value || normalizeType(row.product_type) },
    ...(isSuperAdmin ? [{ key: "branch_id", label: "Cabang", render: (value, row) => branchNames.get(value) || row.branch_code || "—" }] : []),
    { key: "quantity", label: "Qty", render: (value, row) => `${value ?? 0} ${row.unit}`, className: "text-right font-semibold" },
    { key: "min_stock", label: "Minimum", render: (value) => value ?? 0, className: "text-right text-muted-foreground" },
    { key: "status", label: "Status", render: (value) => <span className={`rounded-full px-2 py-1 text-xs font-semibold ${value === "HABIS" ? "bg-red-100 text-red-700" : value === "MENIPIS" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{value}</span> },
    { key: "unit_cost", label: "HPP / Unit", render: (value) => formatCurrency(value || 0), className: "text-right" },
    { key: "inventory_value", label: "Nilai Persediaan", render: (value) => formatCurrency(value || 0), className: "text-right font-semibold" },
  ];

  return <div>
    <PageHeader title="Inventory" subtitle={`Saldo stok per produk dan cabang · Total ${formatCurrency(totalValue)}`} action={isSuperAdmin ? <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm"><option value="">Semua Cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select> : <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{branchNames.get(activeBranchId) || "Cabang user"}</div>} />
    <div className="mb-4 flex flex-wrap gap-2">{TYPES.map((item) => <button key={item} onClick={() => setType(item)} className={`rounded-lg border px-4 py-2 text-sm font-medium ${type === item ? "border-emerald-600 bg-emerald-600 text-white" : "bg-background hover:bg-accent"}`}>{item}</button>)}</div>
    <DataTable columns={columns} data={filtered} loading={loading} searchKeys={["sku", "product_name", "brand", "category_name"]} searchPlaceholder="Cari SKU / produk / brand / kategori..." />
  </div>;
}
