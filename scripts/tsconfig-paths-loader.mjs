// Minimal ESM loader to apply TS path aliases during node --test runs.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createMatchPath } from "tsconfig-paths";

const tsconfigUrl = new URL("../tsconfig.json", import.meta.url);
const tsconfig = JSON.parse(readFileSync(tsconfigUrl, "utf-8"));
const baseUrl = path.resolve(path.dirname(fileURLToPath(tsconfigUrl)), tsconfig.compilerOptions?.baseUrl ?? ".");
const paths = tsconfig.compilerOptions?.paths ?? {};

const matchPath = createMatchPath(baseUrl, paths, undefined, [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]);

export async function resolve(specifier, context, next) {
  const matched = matchPath(specifier);
  if (matched) {
    const url = pathToFileURL(matched).href;
    return next(url, context);
  }
  return next(specifier, context);
}

