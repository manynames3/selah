import { requireAdmin, jsonResponse, readPayload } from "./_auth.js";
import { deleteDevotional } from "./_db.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;

  let payload;
  try {
    payload = await readPayload(context.request);
  } catch {
    return jsonResponse({ error: "invalid-json" }, { status: 400 });
  }

  const id = String(payload && payload.id || "").trim();
  if (!id) return jsonResponse({ error: "missing-id" }, { status: 400 });

  try {
    const existing = await deleteDevotional(context.env, id);
    if (!existing) {
      return jsonResponse({ error: "not-found" }, { status: 404 });
    }

    return jsonResponse({ deleted: true, entry: existing, mediaCleanupScheduled: true });
  } catch (error) {
    return jsonResponse(
      { error: "entry-delete-failed" },
      { status: 500 }
    );
  }
}
