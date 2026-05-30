import { requireAdmin, jsonResponse } from "./_auth.js";
import { extractR2ObjectKeyFromPublicUrl } from "./_media.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;

  const bucket = context.env.AUDIO_BUCKET;
  const publicBaseUrl = context.env.AUDIO_PUBLIC_BASE_URL;

  let payload;
  try {
    payload = await context.request.json();
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
      await bucket.delete(r2Key);
      return jsonResponse({ deleted: true, objectKey: r2Key });
    }

    return jsonResponse({ error: "invalid-public-url" }, { status: 400 });
  } catch (error) {
    return jsonResponse(
      { error: "audio-delete-failed", message: String(error && error.message || error) },
      { status: 500 }
    );
  }
}
