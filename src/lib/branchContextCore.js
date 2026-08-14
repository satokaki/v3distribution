export function resolveOperationalBranchId(user, mappings = []) {
  return mappings.find((row) => row.branch_id === user?.default_branch_id)?.branch_id
    || mappings.find((row) => row.is_default)?.branch_id
    || mappings[0]?.branch_id
    || "";
}

export function initialReadScopeBranchId({ isSuperAdmin, operationalBranchId, storedScope, mappings = [] }) {
  if (!isSuperAdmin) return operationalBranchId;
  if (storedScope === "all" || mappings.some((row) => row.branch_id === storedScope)) return storedScope;
  return "all";
}

export function isOperationalBranchId(value) {
  return Boolean(value) && value !== "all";
}
