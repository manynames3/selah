import { requireAdmin } from "./_auth.js";
import { uploadMedia } from "./_media.js";

export async function onRequestPost(context) {
  const denied = await requireAdmin(context);
  if (denied) return denied;

  return uploadMedia(context, {
    kind: "audio",
    bucket: context.env.AUDIO_BUCKET,
    publicBaseUrl: context.env.AUDIO_PUBLIC_BASE_URL,
    keyPrefix: context.env.AUDIO_KEY_PREFIX || "audio",
    defaultFilename: "track.mp3",
    defaultContentType: "application/octet-stream",
    errorCode: "audio-upload-failed"
  });
}
