import { createAdminSessionCookie, jsonResponse, readPayload, passwordMatches } from "./_auth.js";
import { limitRequest } from "./_limits.js";

export async function onRequestPost(context) {
  let payload;
  try {
    payload = await readPayload(context.request);
  } catch {
    return jsonResponse({ error: "invalid-json" }, { status: 400 });
  }

  const expected = String(context.env.ADMIN_PASSWORD || "");
  const provided = String(payload && payload.password || "");
  if (!expected || String(context.env.ADMIN_SESSION_SECRET || "").length < 32 || context.env.ADMIN_SESSION_SECRET === expected) {
    return jsonResponse({ error: "missing-security-config" }, { status: 503 });
  }
  const limited = await limitRequest(context, "login", 10);
  if (limited) return limited;
  if (!provided || provided.length > 200 || !await passwordMatches(provided, expected)) {
    return jsonResponse({ error: "invalid-password" }, { status: 401 });
  }

  const cookie = await createAdminSessionCookie(context.env);
  return jsonResponse(
    { authenticated: true },
    {
      headers: {
        "set-cookie": cookie
      }
    }
  );
}
