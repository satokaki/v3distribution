import { base44 } from "@/api/base44Client";

/**
 * Helper autentikasi & akses multi-cabang (pure, reusable).
 */

export async function getCurrentUser() {
  try {
    return await base44.auth.me();
  } catch {
    return null;
  }
}

/** Super admin = role platform 'admin' atau app_role 'super_admin'. */
export function isSuperAdmin(user) {
  return user?.role === "admin" || user?.app_role === "super_admin";
}

const ROLE_TO_CODE = {
  super_admin: "SUPER_ADMIN",
  kepala_cabang: "KEPALA_CABANG",
  admin_cabang: "ADMIN_CABANG",
  kasir: "KASIR",
  gudang: "GUDANG",
  finance: "FINANCE",
};

// Baseline access is kept in the app so a newly-created Role record cannot
// accidentally expose every module. Permissions stored in Role may extend it.
export const ROLE_BASE_PERMISSIONS = {
  super_admin: ["*"],
  kepala_cabang: ["dashboard.view", "sales.*", "pricing.view", "receivable.*", "purchase.*", "payable.*", "inventory.*", "transfer.*", "cash.*", "bank.view", "reconciliation.view", "customer.*", "product.view", "report.*"],
  admin_cabang: ["dashboard.view", "sales.*", "pricing.view", "receivable.*", "purchase.*", "payable.*", "inventory.*", "transfer.*", "cash.*", "bank.view", "customer.*", "product.view", "report.view"],
  kasir: ["dashboard.view", "sales.view", "sales.create", "pricing.view", "receivable.view", "receivable.create", "customer.view", "customer.create", "product.view", "inventory.view", "cash.view", "cash.create"],
  gudang: ["dashboard.view", "inventory.*", "transfer.view", "transfer.create", "purchase.view", "product.view"],
  finance: ["dashboard.view", "receivable.*", "payable.*", "cash.*", "bank.*", "reconciliation.*", "report.*"],
};

/** Muat permission role global + daftar cabang yang dapat diakses user. */
export async function loadUserAccess(user) {
  if (!user) return { rolePermissions: [], accessibleBranches: [], isSuperAdmin: false };
  const superAdmin = isSuperAdmin(user);

  let rolePermissions = [...(ROLE_BASE_PERMISSIONS[user.app_role] || [])];
  try {
    const code = ROLE_TO_CODE[user.app_role] || user.app_role || user.role;
    const roles = await base44.entities.Role.filter({ code });
    rolePermissions = [
      ...rolePermissions,
      ...(roles[0]?.permissions || []),
    ];
  } catch {
    /* ignore */
  }

  let accessibleBranches = [];
  try {
    accessibleBranches =
      (await base44.entities.UserBranch.filter({ user_id: user.id, status: "active" })) || [];
  } catch {
    /* ignore */
  }

  return { rolePermissions, accessibleBranches, isSuperAdmin: superAdmin };
}

/** Cek permission global (dari role). "*" = akses semua. */
export function hasPermission(perms, perm) {
  if (!perms || !perm) return false;
  if (perms.includes("*")) return true;
  if (perms.includes(perm)) return true;
  const moduleName = perm.split(".")[0];
  return perms.includes(`${moduleName}.*`);
}

const PERM_TO_FLAG = {
  "branch.view": "can_view",
  "branch.create": "can_create",
  "branch.edit": "can_edit",
  "branch.approve": "can_approve",
  "branch.post": "can_post",
  "branch.cancel": "can_cancel",
  "branch.export": "can_export",
};

/** Cek permission di cabang aktif (dari UserBranch). */
export function branchCan(userBranch, perm) {
  if (!userBranch || userBranch.status !== "active") return false;
  const flag = PERM_TO_FLAG[perm];
  if (!flag) return !!userBranch.can_view;
  return !!userBranch[flag];
}

/** Filter satu daftar record agar hanya berisi cabang yang boleh diakses user. */
export function filterByAccessibleBranches(records, accessibleBranchIds, opts = {}) {
  const ids = new Set(accessibleBranchIds || []);
  const key = opts.key || "branch_id";
  return (records || []).filter((r) => ids.has(r[key]));
}
