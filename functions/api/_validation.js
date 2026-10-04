export function validateEntry(payload, env) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid-entry");
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const date = typeof payload.entry_date === "string" ? payload.entry_date : "";
  if (!title || title.length > 200) throw new Error("invalid-title");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) {
    throw new Error("invalid-date");
  }
  const result = { title, entry_date: date };
  for (const [key, max] of [["scripture", 300], ["lyrics", 30000], ["notes", 5000]]) {
    if (payload[key] != null && typeof payload[key] !== "string") throw new Error("invalid-" + key);
    const value = (payload[key] || "").trim();
    if (value.length > max) throw new Error("invalid-" + key);
    result[key] = value || null;
  }
  for (const [key, base] of [["audio_url", env.AUDIO_PUBLIC_BASE_URL], ["art_url", env.ART_PUBLIC_BASE_URL || env.AUDIO_PUBLIC_BASE_URL]]) {
    const value = payload[key];
    if (value != null && typeof value !== "string") throw new Error("invalid-" + key);
    const bases = [base];
    if (env.LOCAL_PREVIEW === "true") bases.push(key === "audio_url" ? env.PREVIEW_AUDIO_SOURCE_BASE : env.PREVIEW_ART_SOURCE_BASE);
    if (value && (!bases.some(allowed => allowed && value.startsWith(allowed.replace(/\/+$/, "") + "/")) || value.length > 2048)) throw new Error("invalid-" + key);
    result[key] = value || null;
  }
  return result;
}

export function validId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
