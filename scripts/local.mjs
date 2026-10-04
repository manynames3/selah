import { mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const testing = process.argv.includes("--test");
const port = testing ? 8790 : 8788;
const state = resolve(testing ? ".wrangler/test-state" : ".wrangler/preview-state");
const appDir = resolve(testing ? ".wrangler/test-app" : ".wrangler/preview-app");
const configFile = appDir + "/wrangler.jsonc";
const cli = resolve("node_modules/wrangler/bin/wrangler.js");
const password = testing ? "test-password-only" : "local-preview-only";

function run(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" } });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolvePromise() : reject(new Error("Local setup failed: " + code)));
  });
}
await mkdir(appDir, { recursive: true });
try { await symlink(resolve("functions"), appDir + "/functions", "dir"); } catch (error) { if (error.code !== "EEXIST") throw error; }
// Only the isolated test database is reset. Preview data and production are untouched.
if (testing) await rm(state, { recursive: true, force: true });
await run(["scripts/build.mjs"]);
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
config.pages_build_output_dir = resolve("dist");
config.d1_databases[0].migrations_dir = resolve("migrations");
config.vars = {
  ...config.vars,
  LOCAL_PREVIEW: "true",
  PREVIEW_AUDIO_SOURCE_BASE: config.vars.AUDIO_PUBLIC_BASE_URL,
  PREVIEW_ART_SOURCE_BASE: config.vars.ART_PUBLIC_BASE_URL,
  ADMIN_PASSWORD: password,
  ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"),
  AUDIO_PUBLIC_BASE_URL: `http://127.0.0.1:${port}/api/local-media`,
  ART_PUBLIC_BASE_URL: `http://127.0.0.1:${port}/api/local-media`
};
await writeFile(configFile, JSON.stringify(config, null, 2));
await run([cli, "d1", "migrations", "apply", "DB", "--local", "--config", configFile, "--persist-to", state]);

if (!testing) {
  try {
    const response = await fetch("https://selah-by8.pages.dev/api/devotionals", { signal: AbortSignal.timeout(10000) });
    const entries = await response.json();
    if (!response.ok || !Array.isArray(entries)) throw new Error("Archive unavailable");
    const sqlValue = value => value == null ? "NULL" : "'" + String(value).replaceAll("'", "''") + "'";
    const columns = ["id", "title", "entry_date", "scripture", "lyrics", "audio_url", "art_url", "created_at", "updated_at", "notes"];
    const sql = entries.map(entry => "INSERT OR IGNORE INTO devotionals (" + columns.join(",") + ") VALUES (" + columns.map(key => sqlValue(entry[key])).join(",") + ");").join("\n");
    const seedFile = resolve(".wrangler/preview-seed.sql");
    await writeFile(seedFile, sql);
    await run([cli, "d1", "execute", "DB", "--local", "--config", configFile, "--persist-to", state, "--file", seedFile]);
    console.log("Copied public song metadata into the isolated preview. Existing local edits were preserved.");
  } catch {
    console.log("Public archive could not be copied. The preview still works; publish a local recording to populate it.");
  }
}
console.log(`Local preview: http://127.0.0.1:${port}/ | Local-only password: ${password}`);
const bindings = Object.entries(config.vars).flatMap(([key, value]) => ["--binding", key + "=" + value]);
const child = spawn(process.execPath, [cli, "pages", "dev", resolve("dist"), "--persist-to", state, "--port", String(port), "--ip", "127.0.0.1", ...bindings], {
  cwd: appDir, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" }
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.once("exit", code => process.exit(code || 0));
