import { jsonResponse } from "./_auth.js";

export async function limitRequest(context, scope, maximum, seconds = 900) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / seconds);
  const ip = context.request.headers.get("cf-connecting-ip") || "local";
  const secret = context.env.ADMIN_SESSION_SECRET;
  if (!secret || !context.env.DB) throw new Error("missing-security-config");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hash = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(scope + ":" + window + ":" + ip));
  const id = scope + ":" + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  const expires = (window + 1) * seconds;
  await context.env.DB.prepare("DELETE FROM request_limits WHERE expires_at < ?").bind(now).run();
  const row = await context.env.DB.prepare(
    "INSERT INTO request_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count"
  ).bind(id, expires).first();
  if (row.count <= maximum) return null;
  return jsonResponse({ error: "too-many-requests", retryAfter: expires - now }, { status: 429, headers: { "retry-after": String(expires - now) } });
}
