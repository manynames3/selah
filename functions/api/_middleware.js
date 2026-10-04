import { jsonResponse, isAdminAuthenticated } from "./_auth.js";
import { drainMediaCleanup } from "./_media.js";

export async function onRequest(context) {
  if (context.request.method === "POST") {
    const origin = context.request.headers.get("origin");
    if (origin !== new URL(context.request.url).origin) return jsonResponse({ error: "invalid-origin" }, { status: 403 });
  }
  try {
    const response = await context.next();
    if (context.request.method === "POST" && response.ok && await isAdminAuthenticated(context)) {
      context.waitUntil(drainMediaCleanup(context.env).catch(() => console.error("media-cleanup-unavailable")));
    }
    const secured = new Response(response.body, response);
    secured.headers.set("x-content-type-options", "nosniff");
    secured.headers.set("cache-control", "no-store");
    return secured;
  } catch (error) {
    console.error("api-request-failed", new URL(context.request.url).pathname, error.message);
    return jsonResponse({ error: "service-unavailable" }, { status: 503 });
  }
}
