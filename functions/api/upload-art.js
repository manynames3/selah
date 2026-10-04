import { requireAdmin } from "./_auth.js";
import { uploadMedia } from "./_media.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;

  return uploadMedia(context, {
    kind: "art",
    bucket: context.env.ART_BUCKET || context.env.AUDIO_BUCKET,
    publicBaseUrl: context.env.ART_PUBLIC_BASE_URL || context.env.AUDIO_PUBLIC_BASE_URL,
    keyPrefix: context.env.ART_KEY_PREFIX || "art",
    defaultFilename: "art.jpg",
    defaultContentType: "image/jpeg",
    errorCode: "art-upload-failed"
  });
}
