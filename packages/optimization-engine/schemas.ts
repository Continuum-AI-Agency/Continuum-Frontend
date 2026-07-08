// BE-safe root-level entry for the IO-boundary zod schemas.
//
// The root `.` entry (src/index.ts) stays pure/dependency-free; the zod schemas
// live behind this subpath so only consumers that need validation pull in zod.
// This file sits at the PACKAGE ROOT (not under src/) so the Backend's classic
// `node` module resolution — which ignores package.json `exports` — resolves
// `@continuum/optimization-engine/schemas` to a real file. The package.json
// `exports["./schemas"]` entry covers bundler/Deno consumers (Frontend, edge).
export * from './src/schemas';
