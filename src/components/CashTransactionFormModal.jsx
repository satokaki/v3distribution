import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useBranchContext } from "@/lib/BranchContext";
import { writeAuditLog } from "@/lib/audit";
import { generateCode, formatCurrency } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring";

const CATEGORIES = ["Penjualan", "Pembelian", "Mutasi Antar Cabang", "Gaji & Upah", "Operasional", "Sewa", "Listrik & Utilitas", "Pembayaran Hutang", "Penerimaan Piutang", "Setoran Modal", "Tarik Modal", "Lain-lain"];

export default function CashTransactionFormModal({ open, onClose, onSaved, existingCount }) {
  const { toast } = useToast();
  const { activeBranchId, isSuperAdmin } = useBranchContext();
  const [accounts, setAccounts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    account_id: "",
    branch_id: "",
    type: "in",
    category: "Lain-lain",
    amount: 0,
    description: "",
    note: "",
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [a, b] = await Promise.all([
          base44.entities.Account.list(),
          base44.entities.Branch.list(),
        ]);
        const allowed = isSuperAdmin ? b : b.filter((x) => x.id === activeBranchId);
        setAccounts((a || []).filter((x) => x.is_active !== false));
        setBranches(allowed);
        setForm((f) => ({ ...f, branch_id: f.branch_id || allowed[0]?.id || "" }));
      } catch {
        toast({ title: "Gagal memuat data master", variant: "destructive" });
      }
    })();
  }, [open]);

  if (!open) return null;

  const accountOptions = accounts.filter((a) => a.branch_id === form.branch_id);

  const handleSubmit = async () => {
    if (!form.account_id) return toast({ title: "Pilih rekening", variant: "destructive" });
    if (!form.branch_id) return toast({ title: "Pilih cabang", variant: "destructive" });
    if (!Number(form.amount) || Number(form.amount) <= 0) return toast({ title: "Jumlah harus > 0", variant: "destructive" });

    const account = accounts.find((a) => a.id === form.account_id) || {};
    const branch = branches.find((b) => b.id === form.branch_id) || {};
    const amount = Number(form.amount);
    const code = generateCode("KAS", existingCount || 0, 5);
    const balanceAfter = (account.current_balance || 0) + (form.type === "in" ? amount : -amount);

    setSubmitting(true);
    try {
      const created = await base44.entities.CashTransaction.create({
        code,
        date: form.date,
        account_id: form.account_id,
        account_name: account.name || "",
        branch_id: form.branch_id,
        branch_code: branch.code || "",
        type: form.type,
        category: form.category,
        amount,
        balance_after: balanceAfter,
        description: form.description,
        note: form.note,
      });
      // Update saldo rekening
      await base44.entities.Account.update(form.account_id, { current_balance: balanceAfter });
      await writeAuditLog({
        action: form.type === "in" ? "cash_in" : "cash_out",
        module: "buku-kas",
        description: `${form.type === "in" ? "Kas masuk" : "Kas keluar"} ${code} · ${formatCurrency(amount)} (${form.category})`,
        branchId: form.branch_id,
      });
      toast({ title: "Transaksi kas tersimpan & saldo diperbarui" });
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
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-card rounded-2xl shadow-2xl border border-border">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold">Transaksi Kas</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setForm({ ...form, type: "in" })} className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.type === "in" ? "bg-emerald-600 text-white border-emerald-600" : "border-border hover:bg-accent"}`}>
              Kas Masuk
            </button>
            <button onClick={() => setForm({ ...form, type: "out" })} className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.type === "out" ? "bg-rose-600 text-white border-rose-600" : "border-border hover:bg-accent"}`}>
              Kas Keluar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Tanggal</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Cabang</label>
              <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value, account_id: "" })} disabled={!isSuperAdmin} className={inputCls}>
                <option value="">— pilih —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Rekening</label>
            <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} className={inputCls}>
              <option value="">— pilih —</option>
              {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name} (Saldo: {formatCurrency(a.current_balance || 0)})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Kategori</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Jumlah</label>
              <input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Keterangan</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="Deskripsi singkat" />
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
