import { requireAdmin, jsonResponse } from "./_auth.js";
import { buildObjectKey, buildPublicUrl } from "./_media.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;

  const bucket = context.env.ART_BUCKET || context.env.AUDIO_BUCKET;
  const publicBaseUrl = context.env.ART_PUBLIC_BASE_URL || context.env.AUDIO_PUBLIC_BASE_URL;
  const keyPrefix = context.env.ART_KEY_PREFIX || "art";

  const url = new URL(context.request.url);
  const filename = context.request.headers.get("x-file-name") || url.searchParams.get("filename") || "art.jpg";
  const entryDate = context.request.headers.get("x-entry-date") || url.searchParams.get("entryDate") || "";
  const contentType = context.request.headers.get("content-type") || "image/jpeg";
  if (!context.request.body) {
    return jsonResponse({ error: "missing-upload-body" }, { status: 400 });
  }

  try {
    if (!bucket || !publicBaseUrl) {
      return jsonResponse({ error: "missing-r2-config" }, { status: 500 });
    }

    const objectKey = buildObjectKey(keyPrefix, entryDate, filename);
    await bucket.put(objectKey, context.request.body, {
      httpMetadata: { contentType }
    });

    return jsonResponse({
      objectKey,
      publicUrl: buildPublicUrl(publicBaseUrl, objectKey)
    });
  } catch (error) {
    return jsonResponse(
      { error: "art-upload-failed", message: String(error && error.message || error) },
      { status: 500 }
    );
  }
}
