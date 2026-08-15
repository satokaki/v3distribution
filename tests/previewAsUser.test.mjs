import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertCanEnterPreview, isPreviewAdministrator, PREVIEW_USER_SESSION_KEY, resolveEffectiveUser } from "../src/lib/previewAsUserCore.js";
import { hasPermission, ROLE_BASE_PERMISSIONS } from "../src/lib/authAccessCore.js";
import { initialReadScopeBranchId, resolveOperationalBranchId } from "../src/lib/branchContextCore.js";

const source = (file) => fs.readFileSync(new URL(file, import.meta.url), "utf8");
const actualAdmin = { id: "admin-1", role: "admin", app_role: "super_admin", display_name: "Super Admin" };
const cashier = { id: "cashier-1", role: "user", app_role: "kasir", display_name: "Kasir PUFF CORNER", default_branch_id: "PUFF", status: "active" };

test("actualUser tetap admin sementara effectiveUser menjadi target preview", () => {
  assert.equal(resolveEffectiveUser(actualAdmin, cashier), cashier);
  assert.equal(actualAdmin.id, "admin-1");
});

test("user non-Super Admin ditolak memulai preview", () => {
  assert.equal(isPreviewAdministrator(cashier), false);
  assert.throws(() => assertCanEnterPreview(cashier, actualAdmin), /Hanya Super Admin/);
  assert.equal(resolveEffectiveUser(cashier, actualAdmin), cashier);
});

test("target inactive dan target diri sendiri ditolak", () => {
  assert.throws(() => assertCanEnterPreview(actualAdmin, { ...cashier, status: "inactive" }), /harus aktif/);
  assert.throws(() => assertCanEnterPreview(actualAdmin, actualAdmin), /user lain/);
});

test("permission menu mengikuti role effective Kasir", () => {
  const permissions = ROLE_BASE_PERMISSIONS[cashier.app_role];
  assert.equal(hasPermission(permissions, "sales.create"), true);
  assert.equal(hasPermission(permissions, "purchase.create"), false);
  assert.equal(hasPermission(permissions, "system.manage"), false);
});

test("branch dan read scope awal mengikuti effective user", () => {
  const mappings = [{ branch_id: "PUFF", branch_name: "PUFF CORNER", is_default: true }, { branch_id: "V3" }];
  const operational = resolveOperationalBranchId(cashier, mappings);
  assert.equal(operational, "PUFF");
  assert.equal(initialReadScopeBranchId({ isSuperAdmin: false, operationalBranchId: operational, storedScope: "all", mappings }), "PUFF");
});

test("AuthContext menyimpan preview hanya di sessionStorage dan logout menghapusnya", () => {
  const auth = source("../src/lib/AuthContext.jsx");
  assert.equal(PREVIEW_USER_SESSION_KEY, "v3pos.preview_user_id");
  assert.match(auth, /sessionStorage\.setItem\(PREVIEW_USER_SESSION_KEY/);
  assert.match(auth, /sessionStorage\.removeItem\(PREVIEW_USER_SESSION_KEY/);
  assert.doesNotMatch(auth, /localStorage.*preview/i);
  assert.match(auth, /base44\.auth\.me\(\)/);
  assert.doesNotMatch(auth, /loginViaEmailPassword|effectiveUserId/);
});

test("BranchContext dan PermissionGuard memakai effective identity", () => {
  const branch = source("../src/lib/BranchContext.jsx");
  assert.match(branch, /const \{ actualUser, effectiveUser/);
  assert.match(branch, /loadUserAccess\(u\)/);
  assert.match(branch, /isSuperAdmin: isSuper/);
  assert.match(source("../src/components/PermissionGuard.jsx"), /hasPermission\(permission\)/);
});

test("Layout memiliki menu, banner, exit preview, dan logout context", () => {
  const layout = source("../src/components/Layout.jsx");
  assert.match(layout, /Lihat Sebagai User/);
  assert.match(layout, /PREVIEW MODE — Melihat sebagai/);
  assert.match(layout, /Kembali ke Super Admin/);
  assert.match(layout, /logout\(true\)/);
  assert.doesNotMatch(layout, /base44\.auth\.logout/);
});
