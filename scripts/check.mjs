import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function checkDirectory(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = path + "/" + entry.name;
    if (entry.isDirectory()) await checkDirectory(file);
    else if (/\.(m?js)$/.test(file)) {
      const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
      if (result.status) process.exit(result.status);
    }
  }
}
for (const path of ["assets", "functions", "scripts", "tests"]) await checkDirectory(path);
const html = await readFile("index.html", "utf8");
if (/\son\w+\s*=/.test(html)) throw new Error("Inline event handlers bypass the content security policy.");
console.log("JavaScript syntax and page policy checks passed.");
