import { requireAdmin, jsonResponse, readPayload } from "./_auth.js";
import { validId } from "./_validation.js";

export async function onRequestGet(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  const { results } = await context.env.DB.prepare(
    "SELECT f.*, d.title FROM feedback f JOIN devotionals d ON d.id = f.entry_id ORDER BY f.status DESC, f.created_at DESC LIMIT 200"
  ).all();
  return jsonResponse({ feedback: results || [] });
}

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;
  let payload;
  try { payload = await readPayload(context.request); } catch { return jsonResponse({ error: "invalid-json" }, { status: 400 }); }
  if (!validId(payload?.id) || !["approve", "delete"].includes(payload.action)) return jsonResponse({ error: "invalid-action" }, { status: 400 });
  const statement = payload.action === "approve"
    ? "UPDATE feedback SET status = 'approved' WHERE id = ?"
    : "DELETE FROM feedback WHERE id = ?";
  const result = await context.env.DB.prepare(statement).bind(payload.id).run();
  if (!result.meta.changes) return jsonResponse({ error: "not-found" }, { status: 404 });
  return jsonResponse({ updated: true });
}
