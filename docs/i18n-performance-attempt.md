# i18n performance attempt — 2026-11-12

Latest result: [production bundle comparison](i18n-production-bundle-results.md). The candidate compiles but fails bundle budgets; browser timings remain unrun.

**Performance preservation is unproven.** The production build and browser comparisons have not run.

## What this attempt established

The local standalone dependency attempt refused its immediate storage admission before starting an installer. Free space crossed the 50 GiB floor initially, then fell below it. No files were removed and the gate was not lowered.

The dedicated GCP builder `continuum-backend-builder` in `us-west1-a` is stopped. Approval has been requested for an isolated attempt lasting at most one hour, followed by returning it to stopped. It has not been started.

Read-only analysis of the real scope manifest and ICU compiler found that Scale's English client scope contains 5,422 keys, producing 135,224 gzip bytes (132.1 KiB) when its compiled message object is serialized as JSON. This identifies a substantial catalog scope to inspect. It is **not** a measured browser response, net bundle increase, or a failure of the separate 10 KiB shared-runtime gate; the baseline already contains English text in its code. All three locales and representative scopes are retained in `compiled-catalog-sizes.json`.

## Build prerequisite corrected

The Frontend build command now runs `next typegen` before its separate TypeScript check. This avoids relying on route/root-parameter declarations from an earlier dev/build directory. A fresh source snapshot generated `locale(): Promise<string>` successfully using the installed Next 16.3.5. The standalone lockfile uses Next 16.3.1, so this is a focused code-generation check, not standalone build qualification. Scoped manifest checks and both lockfile checks pass. No application runtime code changed in this attempt.

## Inputs and remaining proof

The prepared candidate source fingerprint is `0b9cbe928e0482411e9f83a3ecb337b7abc6a895033a119ae4be640a487b7860`. Its archive SHA-256 is `c3bde6f94a3e3529fb2e6e69778f819aff50e56f2d34e921899db768e828dd17`. The pre-i18n archive remains generation `1794418018853693`, SHA-256 `3f52234b063d0861e604218331faef6a10059a934d043e566ae15c7f872e1656`. Public assets were verified clean at the captured Frontend revision and have an exact file/hash manifest.

Remaining gates: qualified locked standalone dependencies, baseline/candidate production builds, actual shared-runtime and route payload sizes, and ten paired browser measurements through real authentication, stored data and Backend paths. Zero production browser cases and zero paired timing samples have run. The next step is an admitted local build or the approved bounded remote attempt; source analysis does not substitute for either.

Evidence destination: `gs://continuum-production-477821-creative-benchmarks/i18n/20261112T0120Z-perf-proof/`. Staging is capped at 2 GiB. No cleanup or deployment is included.
