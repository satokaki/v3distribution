import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import { writeAuditLog } from "@/lib/audit";
import { generateCode, formatCurrency } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

export default function TambahHutangModal({ open, onClose, onSaved, existingCount }) {
  const { toast } = useToast();
  const { accessibleBranches, isSuperAdmin } = useBranchContext();
  const [suppliers, setSuppliers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    due_date: "",
    branch_id: "",
    supplier_id: "",
    amount: 0,
    note: "",
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [s, b] = await Promise.all([base44.entities.Supplier.list(), base44.entities.Branch.list()]);
        const allowed = isSuperAdmin ? b : b.filter((x) => accessibleBranches.some((ab) => ab.branch_id === x.id));
        setSuppliers((s || []).filter((x) => x.is_active !== false));
        setBranches(allowed);
        setForm((f) => ({ ...f, branch_id: f.branch_id || allowed[0]?.id || "" }));
      } catch {
        toast({ title: "Gagal memuat data", variant: "destructive" });
      }
    })();
  }, [open]);

  if (!open) return null;

  const supplierOptions = suppliers.filter((s) => !form.branch_id || s.owner_branch_id === form.branch_id || s.sync_enabled);

  const handleSubmit = async () => {
    if (!form.supplier_id) return toast({ title: "Pilih supplier", variant: "destructive" });
    if (!form.branch_id) return toast({ title: "Pilih cabang", variant: "destructive" });
    if (!Number(form.amount) || Number(form.amount) <= 0) return toast({ title: "Nilai hutang harus > 0", variant: "destructive" });

    const supplier = suppliers.find((s) => s.id === form.supplier_id) || {};
    const branch = branches.find((b) => b.id === form.branch_id) || {};
    const code = generateCode("HTG", existingCount || 0, 5);
    const amount = Number(form.amount);

    setSubmitting(true);
    try {
      await base44.entities.Payable.create({
        code, date: form.date, due_date: form.due_date,
        supplier_id: form.supplier_id, supplier_name: supplier.name || "",
        branch_id: form.branch_id, branch_code: branch.code || "",
        source: "manual",
        amount, paid_amount: 0, status: "unpaid", note: form.note,
      });
      // update saldo hutang supplier
      if (supplier.id) {
        await base44.entities.Supplier.update(supplier.id, { debt_balance: (supplier.debt_balance || 0) + amount });
      }
      await writeAuditLog({ action: "create_hutang", module: "hutang", description: `Catat hutang ${code} · ${formatCurrency(amount)} (${supplier.name})`, branchId: form.branch_id });
      toast({ title: "Hutang dicatat" });
      onSaved && onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Gagal menyimpan", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-card rounded-2xl shadow-2xl border border-border">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold">Catat Hutang</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Tanggal</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Jatuh Tempo</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Cabang</label>
            <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value, supplier_id: "" })} className={inputCls}>
              <option value="">— pilih —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Supplier</label>
            <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} className={inputCls}>
              <option value="">— pilih —</option>
              {supplierOptions.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Nilai Hutang</label>
            <input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Catatan</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className={inputCls} />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent">Batal</button>
            <button type="button" onClick={handleSubmit} disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Simpan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}