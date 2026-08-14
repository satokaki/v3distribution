import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ShieldX, Building2 } from "lucide-react";
import { useBranchContext } from "@/lib/BranchContext";

function AccessMessage({ icon: Icon, title, message }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg text-center rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
          <Icon className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export default function PermissionGuard({ permission, children }) {
  const location = useLocation();
  const { loading, isSuperAdmin, hasBranchAssignment, hasPermission } = useBranchContext();

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">Memuat akses user...</div>;
  if (!hasBranchAssignment) {
    return <AccessMessage icon={Building2} title="Cabang belum ditentukan" message="Hubungi administrator untuk memetakan akun ini ke satu cabang aktif." />;
  }
  if (!isSuperAdmin && permission && !hasPermission(permission)) {
    if (location.pathname !== "/") return <Navigate to="/" replace />;
    return <AccessMessage icon={ShieldX} title="Akses tidak tersedia" message="Role Anda tidak memiliki izin untuk membuka modul ini." />;
  }
  return children;
}
