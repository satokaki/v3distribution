import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { writeAuditLog } from "@/lib/audit";
import { generateCode, formatCurrency } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

export default function PelunasanPiutangModal({ receivable, open, onClose, onSaved, existingCount }) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [accountList, setAccountList] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    account_id: "",
    amount: 0,
    note: "",
  });

  const sisa = receivable ? (receivable.amount || 0) - (receivable.paid_amount || 0) : 0;

  useEffect(() => {
    if (!open || !receivable) return;
    (async () => {
      try {
        const [a, c] = await Promise.all([base44.entities.Account.list(), base44.entities.Customer.list()]);
        setAccountList((a || []).filter((x) => x.is_active !== false));
        setCustomerList(c || []);
        setForm({ date: new Date().toISOString().slice(0, 10), account_id: "", amount: sisa, note: "" });
      } catch {
        toast({ title: "Gagal memuat rekening", variant: "destructive" });
      }
    })();
  }, [open, receivable]);

  if (!open || !receivable) return null;

  const accountOptions = accountList.filter((a) => a.branch_id === receivable.branch_id);

  const handleSubmit = async () => {
    if (!form.account_id) return toast({ title: "Pilih rekening", variant: "destructive" });
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return toast({ title: "Jumlah harus > 0", variant: "destructive" });
    if (amount > sisa) return toast({ title: "Jumlah melebihi sisa piutang", variant: "destructive" });

    const account = accountList.find((a) => a.id === form.account_id) || {};
    const customer = customerList.find((c) => c.id === receivable.customer_id) || {};
    const code = generateCode("PCM", existingCount || 0, 5);
    const newPaid = (receivable.paid_amount || 0) + amount;
    const status = newPaid >= (receivable.amount || 0) ? "paid" : newPaid > 0 ? "partial" : "unpaid";
    const newBalance = (account.current_balance || 0) + amount;

    setSubmitting(true);
    try {
      await base44.entities.ReceivablePayment.create({
        code, date: form.date,
        receivable_id: receivable.id, receivable_code: receivable.code,
        customer_id: receivable.customer_id, customer_name: receivable.customer_name,
        account_id: form.account_id, account_name: account.name || "",
        branch_id: receivable.branch_id, branch_code: receivable.branch_code || "",
        amount, note: form.note,
      });
      await base44.entities.Receivable.update(receivable.id, { paid_amount: newPaid, status });
      await base44.entities.Account.update(form.account_id, { current_balance: newBalance });
      if (customer.id) {
        await base44.entities.Customer.update(customer.id, { receivable_balance: Math.max(0, (customer.receivable_balance || 0) - amount) });
      }
      await writeAuditLog({ action: "pay_piutang", module: "piutang", description: `Pelunasan piutang ${receivable.code} · ${formatCurrency(amount)}`, branchId: receivable.branch_id });
      toast({ title: "Pelunasan tersimpan & saldo rekening diperbarui" });
      onSaved && onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Gagal menyimpan pelunasan", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-card rounded-2xl shadow-2xl border border-border">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold">Pelunasan Piutang</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Piutang</span><span className="font-medium">{receivable.code}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Pelanggan</span><span>{receivable.customer_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Nilai Piutang</span><span>{formatCurrency(receivable.amount || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Terbayar</span><span>{formatCurrency(receivable.paid_amount || 0)}</span></div>
            <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1"><span>Sisa</span><span className="text-rose-600">{formatCurrency(sisa)}</span></div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Tanggal</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Rekening</label>
            <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} className={inputCls}>
              <option value="">— pilih —</option>
              {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name} (Saldo: {formatCurrency(a.current_balance || 0)})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Jumlah Bayar</label>
            <input type="number" min="0" max={sisa} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Catatan</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className={inputCls} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent">Batal</button>
            <button type="button" onClick={handleSubmit} disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Terima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}