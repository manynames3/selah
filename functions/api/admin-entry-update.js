import { requireAdmin, jsonResponse, readPayload } from "./_auth.js";
import { fetchDevotional, updateDevotional } from "./_db.js";
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

  const id = String(payload && payload.id || "").trim();
  let entry;
  try {
    if (!validId(id)) throw new Error("invalid-id");
    entry = validateEntry(payload, context.env);
  } catch (error) { return jsonResponse({ error: error.message }, { status: 400 }); }

  try {
    const existing = await fetchDevotional(context.env, id);
    if (!existing) {
      return jsonResponse({ error: "not-found" }, { status: 404 });
    }

    const updated = await updateDevotional(context.env, id, entry, existing);
    return jsonResponse({ entry: updated });
  } catch (error) {
    return jsonResponse(
      { error: "entry-update-failed" },
      { status: 500 }
    );
  }
}
