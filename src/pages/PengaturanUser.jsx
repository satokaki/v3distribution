import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import UserAccessModal from "@/components/UserAccessModal";
import { writeAuditLog } from "@/lib/audit";
import { Plus, Pencil, KeyRound, Power } from "lucide-react";

const ROLE_LABEL = {
  super_admin: "Super Admin", kepala_cabang: "Kepala Cabang", admin_cabang: "Admin Cabang",
  kasir: "Kasir", gudang: "Gudang", finance: "Finance", admin: "Admin", user: "User",
};

export default function PengaturanUser() {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, b] = await Promise.all([
        base44.entities.User.list("-created_date", 500),
        base44.entities.Branch.list("-created_date", 200),
      ]);
      setUsers(u || []);
      setBranches(b || []);
    } catch {
      toast({ title: "Gagal memuat data user", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (row) => { setEditing(row); setModalOpen(true); };

  const toggleStatus = async (row) => {
    const next = row.status === "inactive" ? "active" : "inactive";
    try {
      await base44.entities.User.update(row.id, { status: next });
      await writeAuditLog({
        action: next === "inactive" ? "deactivate_user" : "activate_user",
        module: "user",
        description: `${next === "inactive" ? "Nonaktifkan" : "Aktifkan"} ${row.email}`,
      });
      toast({ title: next === "inactive" ? "User dinonaktifkan" : "User diaktifkan" });
      load();
    } catch (err) {
      toast({ title: "Gagal mengubah status", description: err.message, variant: "destructive" });
    }
  };

  const resetPassword = async (row) => {
    if (!confirm(`Kirim link reset password ke ${row.email}?`)) return;
    try {
      await base44.auth.resetPasswordRequest(row.email);
      await writeAuditLog({ action: "reset_password", module: "user", description: `Reset password ${row.email}` });
      toast({ title: "Link reset password terkirim ke email user" });
    } catch (err) {
      toast({ title: "Gagal mengirim reset", description: err.message, variant: "destructive" });
    }
  };

  const columns = [
    { key: "user_code", label: "Kode", render: (v) => <span className="font-mono text-xs">{v || "—"}</span> },
    { key: "display_name", label: "Nama", render: (v, r) => v || r.full_name || "—" },
    { key: "email", label: "Email" },
    { key: "app_role", label: "Role", render: (v) => (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{ROLE_LABEL[v] || v}</span>
    ) },
    { key: "phone", label: "Telepon" },
    { key: "status", label: "Status", render: (v) => (
      <span className={`px-2 py-0.5 rounded-full text-xs ${v === "inactive" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
        {v === "inactive" ? "Nonaktif" : "Aktif"}
      </span>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title="User & Hak Akses"
        subtitle="Kelola user, role, penempatan cabang, dan permission"
        action={
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Tambah User
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        searchKeys={["user_code", "display_name", "email", "phone", "app_role"]}
        searchPlaceholder="Cari user..."
        rowActions={(row) => (
          <>
            <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg hover:bg-accent" title="Edit">
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={() => resetPassword(row)} className="p-1.5 rounded-lg hover:bg-accent" title="Reset Password">
              <KeyRound className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={() => toggleStatus(row)} className="p-1.5 rounded-lg hover:bg-accent" title="Aktif/Nonaktif">
              <Power className={`w-4 h-4 ${row.status === "inactive" ? "text-red-500" : "text-green-600"}`} />
            </button>
          </>
        )}
      />
      <UserAccessModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        editing={editing}
        branches={branches}
        existingUsers={users}
      />
    </div>
  );
}