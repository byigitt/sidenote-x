import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const dist = path.join(root, "dist");
const unpacked = path.join(dist, "unpacked");
const archive = path.join(dist, `sidenote-x-${manifest.version}.zip`);

await rm(dist, { recursive: true, force: true });
await mkdir(unpacked, { recursive: true });
const files = [
  "manifest.json", "LICENSE", "PRIVACY.md",
  "assets/icon-16.png", "assets/icon-32.png", "assets/icon-48.png", "assets/icon-128.png",
  "src/background.js", "src/content.js", "src/core.js", "src/store.js", "src/storage.js", "src/worker.js",
  "src/popup.html", "src/popup.css", "src/popup.js",
];
for (const entry of files) {
  const destination = path.join(unpacked, entry);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, entry), destination);
}
execFileSync("zip", ["-q", "-r", archive, "."], { cwd: unpacked });
console.log(`Packaged Sidenote for X v${manifest.version}: ${archive}`);
