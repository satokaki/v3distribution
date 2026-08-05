import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import { Inbox } from "lucide-react";

const selectCls = "px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

const TYPE_LABEL = {
  in: "Masuk",
  out: "Keluar",
  transfer_in: "Mutasi Masuk",
  transfer_out: "Mutasi Keluar",
  opname_in: "Opname +",
  opname_out: "Opname −",
  adjustment: "Penyesuaian",
};

export default function StockCard() {
  const { toast } = useToast();
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    base44.entities.Branch.list().then((r) => setBranches(r || []));
  }, []);

  useEffect(() => {
    if (branchId) {
      base44.entities.Warehouse.filter({ branch_id: branchId }).then((r) => setWarehouses(r || []));
    } else {
      setWarehouses([]);
    }
    setWarehouseId("");
  }, [branchId]);

  const load = async () => {
    setLoading(true);
    try {
      const q = {};
      if (branchId) q.branch_id = branchId;
      if (warehouseId) q.warehouse_id = warehouseId;
      let items = await base44.entities.StockLedger.filter(q, "-date", 500);
      items = items || [];
      if (productSearch.trim()) {
        const s = productSearch.toLowerCase();
        items = items.filter(
          (i) =>
            (i.product_name || "").toLowerCase().includes(s) ||
            (i.sku || "").toLowerCase().includes(s)
        );
      }
      setLedger(items);
    } catch {
      toast({ title: "Gagal memuat kartu stok", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branchId, warehouseId]);

  return (
    <div>
      <PageHeader title="Kartu Stok" subtitle="Histori mutasi stok per produk" />

      <div className="flex flex-wrap gap-3 mb-4">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls}>
          <option value="">Semua Cabang</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={!branchId} className={selectCls}>
          <option value="">Semua Gudang</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <input
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          placeholder="Cari produk / SKU..."
          className={selectCls + " max-w-xs"}
        />
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="text-left font-semibold px-4 py-3">Tanggal</th>
                <th className="text-left font-semibold px-4 py-3">SKU</th>
                <th className="text-left font-semibold px-4 py-3">Produk</th>
                <th className="text-left font-semibold px-4 py-3">Tipe</th>
                <th className="text-left font-semibold px-4 py-3">Ref</th>
                <th className="text-right font-semibold px-4 py-3">Qty</th>
                <th className="text-right font-semibold px-4 py-3">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-muted border-t-foreground rounded-full animate-spin" />
                      Memuat data...
                    </div>
                  </td>
                </tr>
              ) : ledger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Belum ada mutasi stok.
                  </td>
                </tr>
              ) : (
                ledger.map((row, i) => {
                  const isIn = row.movement_type === "in" || row.movement_type === "transfer_in" || row.movement_type === "opname_in";
                  return (
                    <tr key={row.id || i} className="border-b border-border last:border-0 hover:bg-accent/30">
                      <td className="px-4 py-3 whitespace-nowrap">{row.date ? row.date.slice(0, 16).replace("T", " ") : "—"}</td>
                      <td className="px-4 py-3 font-medium">{row.sku || "—"}</td>
                      <td className="px-4 py-3">{row.product_name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isIn ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {TYPE_LABEL[row.movement_type] || row.movement_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.ref_code || "—"}</td>
                      <td className={`px-4 py-3 text-right font-medium ${isIn ? "text-emerald-600" : "text-red-600"}`}>
                        {isIn ? "+" : "−"}{row.quantity || 0}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{row.balance_after ?? 0}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}