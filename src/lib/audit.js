import { base44 } from "@/api/base44Client";
import { getCurrentUser } from "@/lib/authHelpers";

/**
 * Menulis audit log. Best-effort: tidak pernah melempar error ke UI.
 */
export async function writeAuditLog({ action, module = "", description = "", branchId = "" }) {
  try {
    const user = await getCurrentUser();
    await base44.entities.AuditLog.create({
      user_id: user?.id || "",
      user_name: user?.full_name || user?.email || "",
      branch_id: branchId || "",
      action,
      module,
      description,
    });
  } catch {
    /* best-effort */
  }
}