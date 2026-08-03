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
for (const entry of ["manifest.json", "src", "assets", "LICENSE", "PRIVACY.md"]) {
  await cp(path.join(root, entry), path.join(unpacked, entry), { recursive: true });
}
execFileSync("zip", ["-q", "-r", archive, "."], { cwd: unpacked });
console.log(`Packaged Sidenote for X v${manifest.version}: ${archive}`);
