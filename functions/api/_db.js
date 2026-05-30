function requireDb(env) {
  if (!env.DB) throw new Error("missing-d1-binding");
  return env.DB;
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    entry_date: row.entry_date,
    scripture: row.scripture || null,
    lyrics: row.lyrics || null,
    audio_url: row.audio_url || null,
    art_url: row.art_url || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

export async function listDevotionals(env) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `SELECT id, title, entry_date, scripture, lyrics, audio_url, art_url, created_at, updated_at
       FROM devotionals
       ORDER BY entry_date DESC, created_at DESC`
    )
    .all();
  return (results || []).map(normalizeRow);
}

export async function fetchDevotional(env, id) {
  const db = requireDb(env);
  const row = await db
    .prepare(
      `SELECT id, title, entry_date, scripture, lyrics, audio_url, art_url, created_at, updated_at
       FROM devotionals
       WHERE id = ?`
    )
    .bind(id)
    .first();
  return normalizeRow(row);
}

export async function createDevotional(env, payload) {
  const db = requireDb(env);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO devotionals
       (id, title, entry_date, scripture, lyrics, audio_url, art_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      payload.title,
      payload.entry_date,
      payload.scripture || null,
      payload.lyrics || null,
      payload.audio_url || null,
      payload.art_url || null,
      now,
      now
    )
    .run();

  return fetchDevotional(env, id);
}

export async function updateDevotional(env, id, payload) {
  const db = requireDb(env);
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE devotionals
       SET title = ?,
           entry_date = ?,
           scripture = ?,
           lyrics = ?,
           audio_url = ?,
           art_url = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .bind(
      payload.title,
      payload.entry_date,
      payload.scripture || null,
      payload.lyrics || null,
      payload.audio_url || null,
      payload.art_url || null,
      now,
      id
    )
    .run();

  return fetchDevotional(env, id);
}

export async function deleteDevotional(env, id) {
  const existing = await fetchDevotional(env, id);
  if (!existing) return null;
  await requireDb(env).prepare("DELETE FROM devotionals WHERE id = ?").bind(id).run();
  return existing;
}
