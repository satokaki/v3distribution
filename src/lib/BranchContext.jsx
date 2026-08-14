import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  getCurrentUser,
  loadUserAccess,
  isSuperAdmin,
  hasPermission,
  branchCan,
} from "@/lib/authHelpers";
import { writeAuditLog } from "@/lib/audit";
import { useAuth } from "@/lib/AuthContext";

const BranchContext = createContext(null);
const LS_KEY = "v3pos.head_office_branch_id";

export function BranchProvider({ children }) {
  const { user: authenticatedUser } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessibleBranches, setAccessibleBranches] = useState([]);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState("");

  const isSuper = isSuperAdmin(user);

  useEffect(() => {
    (async () => {
      const u = authenticatedUser || await getCurrentUser();
      if (!u) {
        setLoading(false);
        return;
      }
      setUser(u);
      const { rolePermissions: rp, accessibleBranches: ab, isSuperAdmin: sa } = await loadUserAccess(u);
      setRolePermissions(rp);
      setAccessibleBranches(ab);

      // Tentukan cabang aktif awal
      let chosen = "";
      if (sa) {
        const stored = localStorage.getItem(LS_KEY);
        chosen = stored === "all" || ab.some((b) => b.branch_id === stored) ? stored : "all";
      } else {
        const def = ab.find((b) => b.is_default);
        // Operational users are always locked to their mapped default branch.
        const mappedDefault = ab.find((b) => b.branch_id === u.default_branch_id);
        chosen = mappedDefault?.branch_id || def?.branch_id || ab[0]?.branch_id || "";
      }
      setActiveBranchId(chosen);
      setLoading(false);
    })();
  }, [authenticatedUser]);

  const setActiveBranch = useCallback((id) => {
    if (!isSuper) return;
    setActiveBranchId(id);
    localStorage.setItem(LS_KEY, id);
    writeAuditLog({
      action: "switch_branch",
      module: "auth",
      description: `Ganti cabang aktif ke ${id}`,
      branchId: id === "all" ? "" : id,
    });
  }, [isSuper]);

  const activeBranch = accessibleBranches.find((b) => b.branch_id === activeBranchId);
  const isAllBranches = isSuper && activeBranchId === "all";

  const value = {
    user,
    loading,
    isSuperAdmin: isSuper,
    accessibleBranches,
    rolePermissions,
    activeBranchId,
    activeBranch,
    isAllBranches,
    hasBranchAssignment: isSuper || !!activeBranchId,
    canSwitchBranch: isSuper,
    setActiveBranch,
    hasPermission: (perm) => hasPermission(rolePermissions, perm),
    branchCan: (perm) => branchCan(activeBranch, perm),
  };

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranchContext() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranchContext harus dipakai di dalam BranchProvider");
  return ctx;
}
