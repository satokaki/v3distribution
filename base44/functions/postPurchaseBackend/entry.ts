import { createClientFromRequest } from "npm:@base44/sdk";
import { postTransaction, safePostingError } from "../../shared/postingCore.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "UNAUTHENTICATED", message: "Authentication required" }, { status: 401 });
    const payload = await req.json();
    const result = await postTransaction({ kind: "purchase", payload, user, db: base44.asServiceRole.entities });
    return Response.json(result);
  } catch (error) {
    const safe = safePostingError(error);
    return Response.json(safe.body, { status: safe.status });
  }
}
