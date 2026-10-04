import { jsonResponse } from "./_auth.js";

export function sanitizeSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";
}

export function buildObjectKey(prefix, entryDate, filename) {
  const original = String(filename || "file.bin");
  const dot = original.lastIndexOf(".");
  const ext = dot > -1 ? original.slice(dot + 1).toLowerCase() : "bin";
  const stem = dot > -1 ? original.slice(0, dot) : original;
  const safePrefix = sanitizeSegment(prefix || "files");
  const safeDate = sanitizeSegment(entryDate || "undated");
  const safeStem = sanitizeSegment(stem);
  const safeExt = sanitizeSegment(ext);
  return safePrefix + "/" + safeDate + "/" + crypto.randomUUID() + "-" + safeStem + "." + safeExt;
}

export function buildPublicUrl(baseUrl, key) {
  return String(baseUrl || "").replace(/\/+$/, "") + "/" + String(key || "").split("/").map(encodeURIComponent).join("/");
}

export async function uploadMedia(context, options) {
  const request = context.request;
  const url = new URL(request.url);
  const filename = request.headers.get("x-file-name") || url.searchParams.get("filename") || options.defaultFilename;
  const entryDate = request.headers.get("x-entry-date") || url.searchParams.get("entryDate") || "";
  if (!request.body) return jsonResponse({ error: "missing-upload-body" }, { status: 400 });
  const maxBytes = options.kind === "art" ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > maxBytes) return jsonResponse({ error: "file-too-large" }, { status: 413 });
  const extension = filename.split(".").pop().toLowerCase();
  const types = options.kind === "art"
    ? { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }
    : { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac" };
  const contentType = types[extension];
  if (!contentType) return jsonResponse({ error: "unsupported-file-type" }, { status: 415 });

  try {
    if (!options.bucket || !options.publicBaseUrl) {
      return jsonResponse({ error: "missing-r2-config" }, { status: 500 });
    }

    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return jsonResponse({ error: "file-too-large" }, { status: 413 }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const header = new TextDecoder("latin1").decode(bytes.slice(0, 16));
    const signatures = {
      mp3: header.startsWith("ID3") || (bytes[0] === 255 && (bytes[1] & 224) === 224),
      wav: header.startsWith("RIFF") && header.slice(8, 12) === "WAVE",
      ogg: header.startsWith("OggS"), m4a: header.slice(4, 8) === "ftyp", flac: header.startsWith("fLaC"),
      jpg: bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      jpeg: bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      png: bytes[0] === 137 && header.slice(1, 4) === "PNG",
      webp: header.startsWith("RIFF") && header.slice(8, 12) === "WEBP", gif: header.startsWith("GIF8")
    };
    if (size < 12 || !signatures[extension]) return jsonResponse({ error: "invalid-file-content" }, { status: 415 });
    const objectKey = buildObjectKey(options.keyPrefix, entryDate, filename);
    const publicUrl = buildPublicUrl(options.publicBaseUrl, objectKey);
    // Track unattached uploads before writing them; saved entries protect referenced URLs.
    await context.env.DB.prepare("INSERT INTO media_cleanup (url, due_at) VALUES (?, ?)").bind(publicUrl, Date.now() + 86400000).run();
    await options.bucket.put(objectKey, bytes, {
      httpMetadata: { contentType }
    });

    return jsonResponse({
      objectKey,
      publicUrl
    });
  } catch (error) {
    return jsonResponse(
      { error: options.errorCode },
      { status: 500 }
    );
  }
}

export function extractR2ObjectKeyFromPublicUrl(publicBaseUrl, objectUrl) {
  const base = String(publicBaseUrl || "").replace(/\/+$/, "");
  const url = String(objectUrl || "");
  if (!base || !url || !url.startsWith(base + "/")) return null;
  try { return url
    .slice(base.length + 1)
    .split("?")[0]
    .split("/")
    .map(decodeURIComponent)
    .join("/"); } catch { return null; }
}

export function mediaCleanupStatements(env, existing, next) {
  return ["audio_url", "art_url"].flatMap(key => {
    const url = existing && existing[key];
    if (!url || (next && (next.audio_url === url || next.art_url === url))) return [];
    if (env.LOCAL_PREVIEW === "true" && !url.startsWith(env.AUDIO_PUBLIC_BASE_URL + "/")) return [];
    return [env.DB.prepare("INSERT INTO media_cleanup (url, due_at) VALUES (?, ?) ON CONFLICT(url) DO UPDATE SET due_at = excluded.due_at").bind(url, Date.now())];
  });
}

export async function drainMediaCleanup(env) {
  const { results } = await env.DB.prepare("SELECT url FROM media_cleanup WHERE due_at <= ? ORDER BY due_at LIMIT 20").bind(Date.now()).all();
  let removed = 0, failed = 0;
  for (const row of results || []) {
    try {
      const referenced = await env.DB.prepare("SELECT id FROM devotionals WHERE audio_url = ? OR art_url = ? LIMIT 1").bind(row.url, row.url).first();
      if (!referenced) {
        let key = extractR2ObjectKeyFromPublicUrl(env.ART_PUBLIC_BASE_URL || env.AUDIO_PUBLIC_BASE_URL, row.url);
        let bucket = env.ART_BUCKET || env.AUDIO_BUCKET;
        if (!key) { key = extractR2ObjectKeyFromPublicUrl(env.AUDIO_PUBLIC_BASE_URL, row.url); bucket = env.AUDIO_BUCKET; }
        if (!key || !bucket) throw new Error("missing-cleanup-config");
        await bucket.delete(key);
        removed++;
      }
      await env.DB.prepare("DELETE FROM media_cleanup WHERE url = ?").bind(row.url).run();
    } catch {
      failed++;
      await env.DB.prepare("UPDATE media_cleanup SET attempts = attempts + 1, due_at = ? WHERE url = ?").bind(Date.now() + 60000, row.url).run();
      console.error("media-cleanup-retry-scheduled");
    }
  }
  return { removed, failed };
}
