import assert from "node:assert/strict";
import test from "node:test";
import { uploadMedia, drainMediaCleanup } from "../functions/api/_media.js";

test("uploads validate content and limit bytes before writing", async () => {
  const writes = [];
  const bucket = { put: async (key, bytes, options) => writes.push({ key, size: bytes.length, options }) };
  const env = { DB: { prepare: () => ({ bind: () => ({ run: async () => ({}) }) }) } };
  const options = { kind: "audio", bucket, publicBaseUrl: "https://media.example", keyPrefix: "audio", defaultFilename: "track.mp3", errorCode: "upload-failed" };
  const upload = async (name, body, headers = {}) => uploadMedia({ env, request: new Request("https://selah.test/api/upload-audio?filename=" + encodeURIComponent(name), { method: "POST", body, headers }) }, options);
  assert.equal((await upload("fake.mp3", "not audio at all")).status, 415);
  assert.equal((await upload("script.svg", "<svg></svg>")).status, 415);
  assert.equal((await upload("large.mp3", "ID3", { "content-length": String(21 * 1024 * 1024) })).status, 413);
  assert.equal(writes.length, 0);
  const response = await upload("Morning & Grace.mp3", "ID3" + "\0".repeat(15));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.objectKey, /^audio\/undated\/[0-9a-f-]+-morning-grace\.mp3$/);
  assert.equal(writes[0].options.httpMetadata.contentType, "audio/mpeg");
});

test("cleanup preserves referenced files and keeps failed deletes for retry", async () => {
  const removed = [], retried = [], deletedReceipts = [];
  const env = {
    AUDIO_PUBLIC_BASE_URL: "https://media.example",
    AUDIO_BUCKET: { delete: async key => { if (key.includes("fail")) throw new Error("R2 offline"); removed.push(key); } },
    DB: { prepare: sql => ({ bind: (...args) => ({
      all: async () => ({ results: [{ url: "https://media.example/audio/used.mp3" }, { url: "https://media.example/audio/old.mp3" }, { url: "https://media.example/audio/fail.mp3" }] }),
      first: async () => args[0].includes("used") ? { id: "referenced" } : null,
      run: async () => { if (sql.startsWith("UPDATE")) retried.push(args[1]); else deletedReceipts.push(args[0]); }
    }) }) }
  };
  assert.deepEqual(await drainMediaCleanup(env), { removed: 1, failed: 1 });
  assert.deepEqual(removed, ["audio/old.mp3"]);
  assert.deepEqual(retried, ["https://media.example/audio/fail.mp3"]);
  assert.equal(deletedReceipts.length, 2);
});
