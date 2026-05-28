import { createRequire } from "node:module";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, "..");
const publicDir = join(frontendRoot, "public", "nutrient-viewer");

const require = createRequire(import.meta.url);

let pkgJsonPath;
try {
  pkgJsonPath = require.resolve("@nutrient-sdk/viewer/package.json");
} catch (err) {
  console.warn(
    "[copy-nutrient-assets] @nutrient-sdk/viewer not installed; skipping. " +
      "Preview features will be disabled until install completes.",
    err?.message ?? err,
  );
  process.exit(0);
}

const distDir = join(dirname(pkgJsonPath), "dist");

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });
await cp(distDir, publicDir, { recursive: true });
console.log(`[copy-nutrient-assets] Copied ${distDir} -> ${publicDir}`);
