import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const path of ["index.html", "assets", "_headers", "_routes.json"]) {
  await cp(path, "dist/" + path, { recursive: true });
}
console.log("Built public assets only; configuration, tests and docs stay outside the web root.");
