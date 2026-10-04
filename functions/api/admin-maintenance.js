import { requireAdmin, jsonResponse } from "./_auth.js";
import { drainMediaCleanup } from "./_media.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  return jsonResponse(await drainMediaCleanup(context.env));
}
