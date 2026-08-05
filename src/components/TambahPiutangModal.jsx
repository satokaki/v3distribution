import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import { writeAuditLog } from "@/lib/audit";
import { generateCode, formatCurrency } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

export default function TambahPiutangModal({ open, onClose, onSaved, existingCount }) {
  const { toast } = useToast();
  const { accessibleBranches, isSuperAdmin } = useBranchContext();
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    due_date: "",
    branch_id: "",
    customer_id: "",
    amount: 0,
    note: "",
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [c, b] = await Promise.all([base44.entities.Customer.list(), base44.entities.Branch.list()]);
        const allowed = isSuperAdmin ? b : b.filter((x) => accessibleBranches.some((ab) => ab.branch_id === x.id));
        setCustomers((c || []).filter((x) => x.is_active !== false));
        setBranches(allowed);
        setForm((f) => ({ ...f, branch_id: f.branch_id || allowed[0]?.id || "" }));
      } catch {
        toast({ title: "Gagal memuat data", variant: "destructive" });
      }
    })();
  }, [open]);

  if (!open) return null;

  const customerOptions = customers.filter((c) => !form.branch_id || c.owner_branch_id === form.branch_id || c.sync_enabled);

  const handleSubmit = async () => {
    if (!form.customer_id) return toast({ title: "Pilih pelanggan", variant: "destructive" });
    if (!form.branch_id) return toast({ title: "Pilih cabang", variant: "destructive" });
    if (!Number(form.amount) || Number(form.amount) <= 0) return toast({ title: "Nilai piutang harus > 0", variant: "destructive" });

    const customer = customers.find((c) => c.id === form.customer_id) || {};
    const branch = branches.find((b) => b.id === form.branch_id) || {};
    const code = generateCode("PTG", existingCount || 0, 5);
    const amount = Number(form.amount);

    setSubmitting(true);
    try {
      await base44.entities.Receivable.create({
        code, date: form.date, due_date: form.due_date,
        customer_id: form.customer_id, customer_name: customer.name || "",
        branch_id: form.branch_id, branch_code: branch.code || "",
        source: "manual",
        amount, paid_amount: 0, status: "unpaid", note: form.note,
      });
      if (customer.id) {
        await base44.entities.Customer.update(customer.id, { receivable_balance: (customer.receivable_balance || 0) + amount });
      }
      await writeAuditLog({ action: "create_piutang", module: "piutang", description: `Catat piutang ${code} · ${formatCurrency(amount)} (${customer.name})`, branchId: form.branch_id });
      toast({ title: "Piutang dicatat" });
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
          <h2 className="text-lg font-semibold">Catat Piutang</h2>
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
            <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value, customer_id: "" })} className={inputCls}>
              <option value="">— pilih —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Pelanggan</label>
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className={inputCls}>
              <option value="">— pilih —</option>
              {customerOptions.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Nilai Piutang</label>
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