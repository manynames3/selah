import { requireAdmin, jsonResponse, readPayload } from "./_auth.js";
import { extractR2ObjectKeyFromPublicUrl } from "./_media.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;

  const bucket = context.env.AUDIO_BUCKET;
  const publicBaseUrl = context.env.AUDIO_PUBLIC_BASE_URL;

  let payload;
  try {
    payload = await readPayload(context.request);
  } catch {
    return jsonResponse({ error: "invalid-json" }, { status: 400 });
  }

  try {
    if (!bucket || !publicBaseUrl) {
      return jsonResponse({ error: "missing-r2-config" }, { status: 500 });
    }

    const audioUrl = payload && payload.url;
    const r2Key = extractR2ObjectKeyFromPublicUrl(publicBaseUrl, audioUrl);
    if (r2Key) {
      const referenced = await context.env.DB.prepare("SELECT id FROM devotionals WHERE audio_url = ? OR art_url = ? LIMIT 1").bind(audioUrl, audioUrl).first();
      if (referenced) return jsonResponse({ error: "media-still-in-use" }, { status: 409 });
      await context.env.DB.prepare("INSERT INTO media_cleanup (url, due_at) VALUES (?, ?) ON CONFLICT(url) DO UPDATE SET due_at = excluded.due_at").bind(audioUrl, Date.now()).run();
      return jsonResponse({ mediaCleanupScheduled: true, objectKey: r2Key });
    }

    return jsonResponse({ error: "invalid-public-url" }, { status: 400 });
  } catch (error) {
    return jsonResponse(
      { error: "audio-delete-failed" },
      { status: 500 }
    );
  }
}
