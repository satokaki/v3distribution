import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { writeAuditLog } from "@/lib/audit";
import { X, Loader2 } from "lucide-react";

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "kepala_cabang", label: "Kepala Cabang" },
  { value: "admin_cabang", label: "Admin Cabang" },
  { value: "kasir", label: "Kasir" },
  { value: "gudang", label: "Gudang" },
  { value: "finance", label: "Finance" },
];

const PERM_FLAGS = [
  { key: "can_view", label: "Lihat", def: true },
  { key: "can_create", label: "Tambah", def: false },
  { key: "can_edit", label: "Ubah", def: false },
  { key: "can_approve", label: "Setujui", def: false },
  { key: "can_post", label: "Posting", def: false },
  { key: "can_cancel", label: "Batal", def: false },
  { key: "can_export", label: "Export", def: false },
];

function nextUserCode(users) {
  let max = 0;
  (users || []).forEach((u) => {
    const m = /USR-(\d+)/.exec(u.user_code || "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return "USR-" + String(max + 1).padStart(6, "0");
}

export default function UserAccessModal({ open, onClose, onSaved, editing, branches, existingUsers }) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ email: "", display_name: "", phone: "", role: "kasir", status: "active", user_code: "" });
  const [assignments, setAssignments] = useState({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        email: editing.email || "",
        display_name: editing.display_name || "",
        phone: editing.phone || "",
        role: editing.role || "kasir",
        status: editing.status || "active",
        user_code: editing.user_code || "",
      });
      (async () => {
        try {
          const ub = await base44.entities.UserBranch.filter({ user_id: editing.id });
          const map = {};
          (ub || []).forEach((b) => {
            map[b.branch_id] = {
              assignment_role: b.assignment_role || editing.role || "",
              is_branch_manager: !!b.is_branch_manager,
              is_default: !!b.is_default,
              can_view: b.can_view ?? true,
              can_create: b.can_create ?? false,
              can_edit: b.can_edit ?? false,
              can_approve: b.can_approve ?? false,
              can_post: b.can_post ?? false,
              can_cancel: b.can_cancel ?? false,
              can_export: b.can_export ?? false,
            };
          });
          setAssignments(map);
        } catch {
          setAssignments({});
        }
      })();
    } else {
      setForm({ email: "", display_name: "", phone: "", role: "kasir", status: "active", user_code: nextUserCode(existingUsers) });
      setAssignments({});
    }
  }, [open, editing, existingUsers]);

  if (!open) return null;

  const selIds = Object.keys(assignments);

  const toggleBranch = (branchId, on) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (on) {
        next[branchId] = next[branchId] || {
          assignment_role: form.role,
          is_branch_manager: false,
          is_default: selIds.length === 0,
          ...Object.fromEntries(PERM_FLAGS.map((p) => [p.key, p.def])),
        };
      } else {
        delete next[branchId];
      }
      return next;
    });
  };

  const setDefault = (branchId) => {
    setAssignments((prev) => {
      const next = {};
      Object.keys(prev).forEach((k) => { next[k] = { ...prev[k], is_default: k === branchId }; });
      return next;
    });
  };

  const updateAssign = (branchId, patch) => {
    setAssignments((prev) => ({ ...prev, [branchId]: { ...prev[branchId], ...patch } }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email) return toast({ title: "Email wajib diisi", variant: "destructive" });
    const dup = existingUsers.find((u) => u.email.toLowerCase() === form.email.toLowerCase() && u.id !== editing?.id);
    if (dup) return toast({ title: "Email sudah dipakai user lain", variant: "destructive" });
    if (selIds.length === 0 && form.role !== "super_admin")
      return toast({ title: "Pilih minimal satu cabang", variant: "destructive" });
    const defBranch = selIds.find((id) => assignments[id].is_default) || selIds[0] || "";

    setSubmitting(true);
    try {
      let userId = editing?.id;
      if (editing) {
        await base44.entities.User.update(editing.id, {
          role: form.role,
          phone: form.phone,
          display_name: form.display_name,
          status: form.status,
          user_code: form.user_code,
          default_branch_id: defBranch,
          accessible_branch_ids: selIds,
        });
        await base44.entities.UserBranch.deleteMany({ user_id: editing.id });
        await writeAuditLog({ action: "edit_user", module: "user", description: `Edit user ${form.email}` });
      } else {
        await base44.users.inviteUser(form.email, form.role);
        const users = await base44.entities.User.list("-created_date", 500);
        const created = users.find((u) => u.email.toLowerCase() === form.email.toLowerCase());
        if (!created) throw new Error("User tidak ditemukan setelah undang");
        userId = created.id;
        await base44.entities.User.update(created.id, {
          phone: form.phone,
          display_name: form.display_name,
          status: form.status,
          user_code: form.user_code,
          default_branch_id: defBranch,
          accessible_branch_ids: selIds,
        });
        await writeAuditLog({ action: "add_user", module: "user", description: `Tambah user ${form.email}` });
      }

      if (selIds.length) {
        const records = selIds.map((bid) => {
          const b = branches.find((x) => x.id === bid) || {};
          const a = assignments[bid];
          return {
            user_id: userId,
            user_name: form.display_name || "",
            user_email: form.email,
            branch_id: bid,
            branch_code: b.code || "",
            branch_name: b.name || "",
            assignment_role: a.assignment_role || form.role,
            is_branch_manager: a.is_branch_manager,
            is_default: bid === defBranch,
            can_view: a.can_view,
            can_create: a.can_create,
            can_edit: a.can_edit,
            can_approve: a.can_approve,
            can_post: a.can_post,
            can_cancel: a.can_cancel,
            can_export: a.can_export,
            status: "active",
          };
        });
        await base44.entities.UserBranch.bulkCreate(records);
      }

      toast({ title: editing ? "User diperbarui" : "User ditambahkan & diundang" });
      onSaved && onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Gagal menyimpan user", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-card rounded-2xl shadow-2xl border border-border">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold">{editing ? "Edit User & Akses" : "Tambah User & Akses"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Identitas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email <span className="text-destructive">*</span></label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={!!editing}
                required
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Nama Lengkap</label>
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Nama tampilan user"
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Role <span className="text-destructive">*</span></label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Nomor Telepon</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Kode User</label>
              <input
                type="text"
                value={form.user_code}
                disabled
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background font-mono disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Status Akun</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </div>
          </div>

          {/* Penempatan Cabang */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Cabang yang Dapat Diakses</h3>
              <span className="text-xs text-muted-foreground">{selIds.length} cabang dipilih</span>
            </div>
            {branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada cabang. Tambahkan cabang dulu di Master Data.</p>
            ) : (
              <div className="space-y-2">
                {branches.map((b) => {
                  const a = assignments[b.id];
                  const checked = !!a;
                  return (
                    <div key={b.id} className="rounded-lg border border-border">
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleBranch(b.id, e.target.checked)}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{b.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{b.code} · {b.branch_type}</div>
                        </div>
                        {checked && (
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="radio"
                              name="default-branch"
                              checked={a.is_default}
                              onChange={() => setDefault(b.id)}
                              className="w-3.5 h-3.5"
                            />
                            Default
                          </label>
                        )}
                      </div>
                      {checked && (
                        <div className="px-3 pb-3 pt-1 border-t border-border/60 bg-muted/30 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                            <div>
                              <label className="block text-xs font-medium mb-1">Posisi di Cabang</label>
                              <select
                                value={a.assignment_role}
                                onChange={(e) => updateAssign(b.id, { assignment_role: e.target.value })}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border border-input bg-background"
                              >
                                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                              </select>
                            </div>
                            <label className="flex items-center gap-2 text-xs font-medium pt-5">
                              <input
                                type="checkbox"
                                checked={a.is_branch_manager}
                                onChange={(e) => updateAssign(b.id, { is_branch_manager: e.target.checked })}
                                className="w-4 h-4"
                              />
                              Kepala Cabang
                            </label>
                          </div>
                          <div>
                            <div className="text-xs font-medium mb-1.5">Permission di cabang ini</div>
                            <div className="flex flex-wrap gap-3">
                              {PERM_FLAGS.map((p) => (
                                <label key={p.key} className="flex items-center gap-1.5 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={!!a[p.key]}
                                    onChange={(e) => updateAssign(b.id, { [p.key]: e.target.checked })}
                                    className="w-3.5 h-3.5"
                                  />
                                  {p.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!editing && (
            <p className="text-xs text-muted-foreground">
              User baru akan dikirim undang via email. Password awal diatur user sendiri setelah menerima undangan.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent">
              Batal
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}