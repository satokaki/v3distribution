export const ROLE_BASE_PERMISSIONS = {
  super_admin: ["*"],
  kepala_cabang: ["dashboard.view", "sales.*", "pricing.view", "receivable.*", "purchase.*", "payable.*", "inventory.*", "transfer.*", "cash.*", "bank.view", "reconciliation.view", "customer.*", "product.view", "report.*"],
  admin_cabang: ["dashboard.view", "sales.*", "pricing.view", "receivable.*", "purchase.*", "payable.*", "inventory.*", "transfer.*", "cash.*", "bank.view", "customer.*", "product.view", "report.view"],
  kasir: ["dashboard.view", "sales.view", "sales.create", "pricing.view", "receivable.view", "receivable.create", "customer.view", "customer.create", "product.view", "inventory.view", "cash.view", "cash.create"],
  gudang: ["dashboard.view", "inventory.*", "transfer.view", "transfer.create", "purchase.view", "product.view"],
  finance: ["dashboard.view", "receivable.*", "payable.*", "cash.*", "bank.*", "reconciliation.*", "report.*"],
};

export function hasPermission(perms, perm) {
  if (!perms || !perm) return false;
  if (perms.includes("*")) return true;
  if (perms.includes(perm)) return true;
  const moduleName = perm.split(".")[0];
  return perms.includes(`${moduleName}.*`);
}
