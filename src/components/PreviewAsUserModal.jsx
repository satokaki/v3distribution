import React, { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useBranchContext } from "@/lib/BranchContext";
import { useToast } from "@/components/ui/use-toast";

const ROLE_LABEL = {
  super_admin: "Super Admin", kepala_cabang: "Kepala Cabang", admin_cabang: "Admin Cabang",
  kasir: "Kasir", gudang: "Gudang", finance: "Finance", admin: "Admin", user: "User",
};

export default function PreviewAsUserModal({ open, onClose }) {
  const { actualUser, canPreviewAsUser, startPreviewAsUser } = useBranchContext();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [branchNames, setBranchNames] = useState(new Map());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [startingId, setStartingId] = useState("");

  useEffect(() => {
    if (!open || !canPreviewAsUser) return;
    let active = true;
    setLoading(true);
    Promise.all([base44.entities.User.list("display_name", 1000), base44.entities.Branch.list("name", 500)])
      .then(([userRows, branches]) => {
        if (!active) return;
        setUsers((userRows || []).filter((user) => user.id !== actualUser?.id && user.status !== "inactive"));
        setBranchNames(new Map((branches || []).map((branch) => [branch.id, `${branch.code} · ${branch.name}`])));
      })
      .catch((error) => toast({ title: "Gagal memuat user preview", description: error.message, variant: "destructive" }))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [actualUser?.id, canPreviewAsUser, open, toast]);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => [user.display_name, user.full_name, user.email, user.app_role, branchNames.get(user.default_branch_id)].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [branchNames, search, users]);

  if (!open || !canPreviewAsUser) return null;

  const start = async (user) => {
    setStartingId(user.id);
    try {
      await startPreviewAsUser(user);
      onClose();
    } catch (error) {
      toast({ title: "Preview tidak dapat dimulai", description: error.message, variant: "destructive" });
    } finally { setStartingId(""); }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
    <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Lihat Sebagai User</h2><p className="text-xs text-muted-foreground">Simulasi tampilan saja. Sesi login Super Admin tidak berubah.</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-accent"><X className="h-5 w-5" /></button></div>
      <div className="border-b p-4"><label className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"><Search className="h-4 w-4 text-muted-foreground" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, role, atau cabang..." className="w-full bg-transparent text-sm outline-none" /></label></div>
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : visibleUsers.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">Tidak ada user aktif yang cocok.</div> : <div className="space-y-2">{visibleUsers.map((user) => <button key={user.id} disabled={Boolean(startingId)} onClick={() => start(user)} className="flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:border-emerald-300 hover:bg-emerald-50/50 disabled:opacity-50"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{(user.display_name || user.full_name || user.email || "U").charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{user.display_name || user.full_name || user.email}</div><div className="truncate text-xs text-muted-foreground">{user.email}</div><div className="mt-1 text-xs text-emerald-700">{ROLE_LABEL[user.app_role] || user.app_role || "User"} · {branchNames.get(user.default_branch_id) || "Cabang default belum diatur"}</div></div>{startingId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4 text-muted-foreground" />}</button>)}</div>}
      </div>
    </div>
  </div>;
}
