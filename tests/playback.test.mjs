import test from "node:test";
import assert from "node:assert/strict";
import { clampTime, progressAt, tonearmAngle, waveformPeaks } from "../assets/playback.js";
import { createAdminSessionCookie, isAdminAuthenticated } from "../functions/api/_auth.js";

test("seeking and needle tracking follow real progress with safe bounds", () => {
  assert.equal(clampTime(-15, 180), 0);
  assert.equal(clampTime(195, 180), 180);
  assert.equal(progressAt(90, 180), .5);
  assert.equal(progressAt(10, Infinity), 0);
  assert.equal(tonearmAngle(0, true), 9);
  assert.equal(tonearmAngle(.5, true), 22.5);
  assert.equal(tonearmAngle(1, true), 36);
  assert.equal(tonearmAngle(3, true), 36);
  assert.equal(tonearmAngle(1, false), 6);
  const samples = new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]);
  assert.deepEqual(waveformPeaks({ numberOfChannels: 1, length: 8, getChannelData: () => samples }, 2), [0, 1]);
});

test("signed admin sessions reject tampering and password-only configuration", async () => {
  const env = { ADMIN_PASSWORD: "test", ADMIN_SESSION_SECRET: "a".repeat(32) };
  const cookie = await createAdminSessionCookie(env);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  const authenticated = cookieValue => isAdminAuthenticated({ env, request: new Request("https://selah.test", { headers: { cookie: cookieValue } }) });
  assert.equal(await authenticated(cookie), true);
  assert.equal(await authenticated(cookie.replace("session=", "session=x")), false);
  await assert.rejects(createAdminSessionCookie({ ADMIN_PASSWORD: "test" }), /missing-admin-session-secret/);
  await assert.rejects(createAdminSessionCookie({ ADMIN_PASSWORD: "a".repeat(32), ADMIN_SESSION_SECRET: "a".repeat(32) }), /missing-admin-session-secret/);
});
