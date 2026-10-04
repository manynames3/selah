import { requireAdmin, jsonResponse, readPayload } from "./_auth.js";
import { createDevotional, fetchDevotional, updateDevotional } from "./_db.js";
import { validateEntry, validId } from "./_validation.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;

  let payload;
  try {
    payload = await readPayload(context.request);
  } catch {
    return jsonResponse({ error: "invalid-json" }, { status: 400 });
  }

  let entry;
  try {
    entry = validateEntry(payload, context.env);
    if (payload.id && !validId(payload.id)) throw new Error("invalid-id");
  } catch (error) { return jsonResponse({ error: error.message }, { status: 400 }); }

  try {
    const existing = payload.id ? await fetchDevotional(context.env, payload.id) : null;
    const row = existing
      ? await updateDevotional(context.env, payload.id, entry, existing)
      : await createDevotional(context.env, entry, payload.id || undefined);
    return jsonResponse({ entry: row });
  } catch (error) {
    return jsonResponse(
      { error: "entry-create-failed" },
      { status: 500 }
    );
  }
}
