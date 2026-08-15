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
import {
  branchAllowsMenu,
  menuItemForPath,
  menuItemByKey,
} from "@/lib/menuAccess";

const BranchContext = createContext(null);
const LS_KEY = "v3pos.head_office_branch_id";

export function BranchProvider({ children }) {
  const { user: authenticatedUser } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessibleBranches, setAccessibleBranches] = useState([]);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [operationalBranchId, setOperationalBranchId] = useState("");
  const [readScopeBranchId, setReadScopeBranchIdState] = useState("");

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

      const operational = resolveOperationalBranchId(u, ab);
      setOperationalBranchId(operational);
      setReadScopeBranchIdState(initialReadScopeBranchId({ isSuperAdmin: sa, operationalBranchId: operational, storedScope: localStorage.getItem(LS_KEY), mappings: ab }));
      setLoading(false);
    })();
  }, [authenticatedUser]);

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

  const roleCan = (perm) => hasPermission(rolePermissions, perm);

  const hasMenuAccess = (menuKey) => {
    if (isSuper) return true;

    const item = menuItemByKey(menuKey);
    if (!item) return true;

    return (
      roleCan(item.permission) &&
      branchAllowsMenu(operationalBranch, menuKey)
    );
  };

  const hasMenuAccessForPath = (pathname) => {
    if (isSuper) return true;

    const item = menuItemForPath(pathname);
    if (!item) return true;

    return (
      roleCan(item.permission) &&
      branchAllowsMenu(operationalBranch, item.key)
    );
  };

  const value = {
    user,
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
    hasPermission: roleCan,
    branchCan: (perm) => branchCan(operationalBranch, perm),
    hasMenuAccess,
    hasMenuAccessForPath,
  };

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranchContext() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranchContext harus dipakai di dalam BranchProvider");
  return ctx;
}
