import { requireAdmin, jsonResponse } from "./_auth.js";
import { buildObjectKey, buildPublicUrl } from "./_media.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;

  const bucket = context.env.AUDIO_BUCKET;
  const publicBaseUrl = context.env.AUDIO_PUBLIC_BASE_URL;
  const keyPrefix = context.env.AUDIO_KEY_PREFIX || "audio";

  const url = new URL(context.request.url);
  const filename = context.request.headers.get("x-file-name") || url.searchParams.get("filename") || "track.mp3";
  const entryDate = context.request.headers.get("x-entry-date") || url.searchParams.get("entryDate") || "";
  const contentType = context.request.headers.get("content-type") || "application/octet-stream";

  if (!context.request.body) {
    return jsonResponse({ error: "missing-upload-body" }, { status: 400 });
  }

  const objectKey = buildObjectKey(keyPrefix, entryDate, filename);

  try {
    if (!bucket || !publicBaseUrl) {
      return jsonResponse({ error: "missing-r2-config" }, { status: 500 });
    }

    await bucket.put(objectKey, context.request.body, {
      httpMetadata: { contentType }
    });

    return jsonResponse({
      objectKey,
      publicUrl: buildPublicUrl(publicBaseUrl, objectKey)
    });
  } catch (error) {
    return jsonResponse(
      { error: "audio-upload-failed", message: String(error && error.message || error) },
      { status: 500 }
    );
  }
}
