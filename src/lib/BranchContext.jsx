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
import { initialReadScopeBranchId, resolveOperationalBranchId } from "@/lib/branchContextCore";

const BranchContext = createContext(null);
const LS_KEY = "v3pos.head_office_branch_id";

export function BranchProvider({ children }) {
  const { actualUser, effectiveUser, isPreviewMode, canPreviewAsUser, startPreviewAsUser, exitPreviewAsUser } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessibleBranches, setAccessibleBranches] = useState([]);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [operationalBranchId, setOperationalBranchId] = useState("");
  const [readScopeBranchId, setReadScopeBranchIdState] = useState("");

  const isSuper = isSuperAdmin(user);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const u = effectiveUser || await getCurrentUser();
      if (!u) {
        if (active) setLoading(false);
        return;
      }
      const { rolePermissions: rp, accessibleBranches: ab, isSuperAdmin: sa } = await loadUserAccess(u);
      if (!active) return;
      setUser(u);
      setRolePermissions(rp);
      setAccessibleBranches(ab);

      const operational = resolveOperationalBranchId(u, ab);
      setOperationalBranchId(operational);
      setReadScopeBranchIdState(initialReadScopeBranchId({ isSuperAdmin: sa, operationalBranchId: operational, storedScope: localStorage.getItem(LS_KEY), mappings: ab }));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [effectiveUser]);

  const setReadScopeBranchId = useCallback((id) => {
    if (!isSuper) return;
    if (id !== "all" && !accessibleBranches.some((row) => row.branch_id === id)) return;
    setReadScopeBranchIdState(id);
    localStorage.setItem(LS_KEY, id);
    writeAuditLog({
      action: "switch_branch",
      module: "auth",
      description: `Ganti cabang aktif ke ${id}`,
      branchId: id === "all" ? "" : id,
    });
  }, [accessibleBranches, isSuper]);

  const operationalBranch = accessibleBranches.find((b) => b.branch_id === operationalBranchId);
  const readScopeBranch = accessibleBranches.find((b) => b.branch_id === readScopeBranchId);
  const isAllBranches = isSuper && readScopeBranchId === "all";

  const value = {
    user,
    actualUser,
    effectiveUser: user,
    isPreviewMode,
    canPreviewAsUser,
    startPreviewAsUser,
    exitPreviewAsUser,
    loading,
    isSuperAdmin: isSuper,
    accessibleBranches,
    rolePermissions,
    operationalBranchId,
    operationalBranch,
    readScopeBranchId,
    readScopeBranch,
    setReadScopeBranchId,
    // Compatibility alias: activeBranchId is READ SCOPE only. Transactions must use operationalBranchId.
    activeBranchId: readScopeBranchId,
    activeBranch: readScopeBranch,
    isAllBranches,
    hasBranchAssignment: !!operationalBranchId,
    canSwitchBranch: isSuper,
    setActiveBranch: setReadScopeBranchId,
    hasPermission: (perm) => hasPermission(rolePermissions, perm),
    branchCan: (perm) => branchCan(operationalBranch, perm),
  };

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranchContext() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranchContext harus dipakai di dalam BranchProvider");
  return ctx;
}
