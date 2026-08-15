import { createClientFromRequest } from "npm:@base44/sdk";
import { deletePurchaseDraft, safePurchaseDraftError } from "../../shared/purchaseDraftCore.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const result = await deletePurchaseDraft({ payload: await req.json(), user, db: base44.asServiceRole.entities });
    return Response.json(result);
  } catch (error) {
    const safe = safePurchaseDraftError(error);
    return Response.json(safe.body, { status: safe.status });
  }
}
