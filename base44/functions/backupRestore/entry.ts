import { createClientFromRequest } from "npm:@base44/sdk";
import {
  BACKUP_ENTITY_REGISTRY,
  BACKUP_PAGE_SIZE,
  BACKUP_SCHEMA_VERSION,
  EXCLUDED_ENTITIES,
  RESTORE_BATCH_SIZE,
  entitiesForMode,
} from "../../shared/backupRegistry.ts";

const SYSTEM_FIELDS = new Set(["created_date", "updated_date", "created_by", "created_by_id", "is_sample"]);

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function cleanRecord(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !SYSTEM_FIELDS.has(key)));
}

async function requireAdmin(base44: any) {
  const user = await base44.auth.me();
  if (!user || (user.role !== "admin" && user.app_role !== "super_admin")) {
    throw Object.assign(new Error("ADMIN_ONLY"), { status: 403 });
  }
  return user;
}

function assertEntity(entity: string, mode?: string) {
  const config = BACKUP_ENTITY_REGISTRY[entity as keyof typeof BACKUP_ENTITY_REGISTRY];
  if (!config) throw Object.assign(new Error("ENTITY_NOT_REGISTERED"), { status: 400 });
  if (mode === "operational" && !config.operational) {
    throw Object.assign(new Error("ENTITY_NOT_OPERATIONAL"), { status: 400 });
  }
  return config;
}

async function restoreOne(handler: any, source: Record<string, unknown>) {
  if (!source.id || typeof source.id !== "string") throw new Error("RESTORE_RECORD_ID_REQUIRED");
  const payload = cleanRecord(source);
  const id = String(source.id);
  const fields = Object.keys(payload).filter((field) => field !== "id");
  try {
    await handler.get(id);
    const updated = await handler.update(id, Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "id")));
    return { id, operation: "updated", fields, stored_id: updated.id };
  } catch (error: any) {
    const status = error?.response?.status ?? error?.status;
    if (status !== 404) throw error;
  }

  const created = await handler.create(payload);
  if (created?.id !== id) {
    if (created?.id) await handler.delete(created.id).catch(() => undefined);
    throw new Error(`ORIGINAL_ID_NOT_PRESERVED:${id}:${created?.id || "unknown"}`);
  }
  const stored = await handler.get(id);
  if (stored?.id !== id) throw new Error(`RESTORE_READBACK_FAILED:${id}`);
  return { id, operation: "created", fields, stored_id: stored.id };
}

export default async function (req: Request) {
  try {
    if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const base44 = createClientFromRequest(req);
    const user = await requireAdmin(base44);
    const db = base44.asServiceRole.entities;
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "registry") {
      return json({
        schema_version: BACKUP_SCHEMA_VERSION,
        page_size: BACKUP_PAGE_SIZE,
        restore_batch_size: RESTORE_BATCH_SIZE,
        operational: entitiesForMode("operational"),
        full: entitiesForMode("full"),
        excluded: EXCLUDED_ENTITIES,
      });
    }

    if (action === "backup_page") {
      const mode = body.mode === "full" ? "full" : "operational";
      const entity = String(body.entity || "");
      assertEntity(entity, mode);
      const skip = Math.max(0, Number(body.skip) || 0);
      const limit = Math.min(BACKUP_PAGE_SIZE, Math.max(1, Number(body.limit) || BACKUP_PAGE_SIZE));
      const records = await db[entity].list("created_date", limit, skip);
      return json({ entity, skip, count: records.length, has_more: records.length === limit, records });
    }

    if (action === "entity_count") {
      const entity = String(body.entity || "");
      assertEntity(entity);
      let total = 0;
      while (true) {
        const page = await db[entity].list("created_date", BACKUP_PAGE_SIZE, total, ["id"]);
        total += page.length;
        if (page.length < BACKUP_PAGE_SIZE) break;
      }
      return json({ entity, count: total });
    }

    if (action === "restore_batch") {
      const mode = body.mode === "full" ? "full" : "operational";
      const entity = String(body.entity || "");
      assertEntity(entity, mode);
      const records = Array.isArray(body.records) ? body.records : [];
      if (!records.length || records.length > RESTORE_BATCH_SIZE) {
        return json({ error: "INVALID_RESTORE_BATCH", max: RESTORE_BATCH_SIZE }, 400);
      }
      if (Number(body.schema_version) !== BACKUP_SCHEMA_VERSION) {
        return json({ error: "RESTORE_SCHEMA_VERSION_UNSUPPORTED" }, 400);
      }
      const results = [];
      for (let index = 0; index < records.length; index += 1) {
        try {
          results.push({ index, status: "success", ...(await restoreOne(db[entity], records[index])) });
        } catch (error: any) {
          results.push({ index, id: records[index]?.id, status: "failed", error: error?.message || String(error) });
        }
      }
      const failed = results.filter((row) => row.status === "failed");
      await db.AuditLog.create({
        user_id: user.id,
        user_name: user.display_name || user.full_name || user.email,
        entity,
        action: failed.length ? "RESTORE_ENTITY_PARTIAL_FAILED" : "RESTORE_ENTITY_BATCH_COMPLETED",
        module: "backup_restore",
        description: `${records.length - failed.length}/${records.length} record selesai`,
      }).catch(() => undefined);
      return json({ entity, processed: records.length, success: records.length - failed.length, failed: failed.length, results });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, error?.status || error?.response?.status || 500);
  }
}
