export const PREVIEW_USER_SESSION_KEY = "v3pos.preview_user_id";

export function isPreviewAdministrator(user) {
  return user?.role === "admin" || user?.app_role === "super_admin";
}

export function isActivePreviewTarget(user) {
  return Boolean(user?.id) && user.status !== "inactive";
}

export function resolveEffectiveUser(actualUser, previewUser) {
  if (!isPreviewAdministrator(actualUser)) return actualUser || null;
  if (!isActivePreviewTarget(previewUser) || previewUser.id === actualUser?.id) return actualUser || null;
  return previewUser;
}

export function assertCanEnterPreview(actualUser, targetUser) {
  if (!isPreviewAdministrator(actualUser)) throw new Error("Hanya Super Admin yang dapat menggunakan Preview As User");
  if (!isActivePreviewTarget(targetUser)) throw new Error("User preview harus aktif");
  if (targetUser.id === actualUser.id) throw new Error("Pilih user lain untuk preview");
  return true;
}
