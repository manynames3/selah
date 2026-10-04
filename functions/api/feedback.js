import { jsonResponse, readPayload } from "./_auth.js";
import { limitRequest } from "./_limits.js";
import { validId } from "./_validation.js";

export async function onRequestGet(context) {
  const entryId = new URL(context.request.url).searchParams.get("entryId");
  if (!validId(entryId)) return jsonResponse({ error: "invalid-entry" }, { status: 400 });
  const { results } = await context.env.DB.prepare(
    "SELECT id, name, comment, timestamp_seconds, created_at FROM feedback WHERE entry_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 100"
  ).bind(entryId).all();
  return jsonResponse({ feedback: results || [] });
}

export async function onRequestPost(context) {
  const limited = await limitRequest(context, "feedback", 5);
  if (limited) return limited;
  let payload;
  try { payload = await readPayload(context.request); } catch { return jsonResponse({ error: "invalid-json" }, { status: 400 }); }
  const entryId = payload && payload.entry_id;
  const comment = typeof payload?.comment === "string" ? payload.comment.trim() : "";
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const timestamp = payload?.timestamp_seconds;
  if (!validId(entryId) || !comment || comment.length > 1000 || name.length > 60 || typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp < 0 || timestamp > 86400) {
    return jsonResponse({ error: "invalid-feedback" }, { status: 400 });
  }
  const entry = await context.env.DB.prepare("SELECT id FROM devotionals WHERE id = ?").bind(entryId).first();
  if (!entry) return jsonResponse({ error: "not-found" }, { status: 404 });
  await context.env.DB.prepare(
    "INSERT INTO feedback (id, entry_id, name, comment, timestamp_seconds, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)"
  ).bind(crypto.randomUUID(), entryId, name || "Guest", comment, timestamp, new Date().toISOString()).run();
  return jsonResponse({ submitted: true, status: "pending" }, { status: 201 });
}
