# i18n production bundle results — 2026-11-12

A later [gzip optimization comparison](i18n-gzip-optimization.md) measures reduced payloads with a separate, controlled local dependency cohort. This standalone builder result remains historical evidence.

**Bundle regression measured; browser timing remains UNRUN. Release qualification fails.**

Both snapshots compiled with the standalone lockfile on the same ARM64 builder using Node v22.23.4, Bun 1.4.2 and Next 16.3.1. The preserved baseline passed its full production gate. The i18n candidate completed Next production compilation/prerendering, then failed the existing login and Organic route bundle gates. No budget was raised.

## First-load JavaScript

Sizes sum gzip-compressed emitted initial JavaScript chunks for each route, using the production route diagnostics and existing bundle reader. These are not measured full-page transfers, HTML/RSC/catalog payload sizes or load-time changes.

| Route | Before, KiB gzip | After, KiB gzip | Added | Change |
|---|---:|---:|---:|---:|
| `/login` | 232.6 | 297.0 | +64.4 KiB | +27.7% |
| `/dashboard` | 938.6 | 985.6 | +47.0 KiB | +5.0% |
| `/organic` | 906.9 | 1002.8 | +95.9 KiB | +10.6% |
| `/scale` | 863.5 | 885.8 | +22.2 KiB | +2.6% |
| `/library` | 1040.6 | 1074.9 | +34.3 KiB | +3.3% |
| `/forge` | 1024.9 | 1051.1 | +26.2 KiB | +2.6% |
| `/ai-studio` | 767.3 | 790.5 | +23.2 KiB | +3.0% |
| `/settings` | 1421.0 | 1443.8 | +22.8 KiB | +1.6% |

The shared-chunk intersection across `/dashboard`, `/organic`, `/scale`, `/library`, `/forge` and `/ai-studio` grew from 634.4 to 649.9 KiB gzip: **+15.5 KiB**, exceeding the allowed +10 KiB by 5.5 KiB. The narrower framework-only `rootMainFiles` bucket is unchanged; it does not include all common application/integration code.

Existing route budgets use their original uncompressed-byte limits; this table compares gzip sizes. The old budget label “authenticated dashboard route” currently targets `/organic`. Budget configuration SHA-256 is identical for both builds: `3ccbaabc57843a1147e38a23c9db6976d063270bd8ff99dc1942f42d6aac4fa6`. The comparison covers the complete snapshots, not the next-intl package in isolation.

## What the run corrected and preserved

The attempt found a migration error: `dither-tiles.css` had moved under `[locale]` while `globals.css` still imported its root location. Its exact original contents were restored to the root path. An omitted shader and two icon assets were recovered for the baseline from captured Frontend revision `31690a080968339505b0508a22b8eb3d3106fd35`, with Git object IDs and SHA-256 recorded. Read-only dependency mounts resolved Turbopack's rejection of external dependency symlinks. All failed attempts remain in the evidence.

Baseline source fingerprint: `2af8b1a9f9f0e631060490359aa8ae6000a7e0fc7eaa4e9a55d7959f433623db`; build ID `V01nXu5diWI3PJTzfCb1T`. Candidate source fingerprint: `913a9b29f3daa000ac8bfde6e5eaa6cc3f0e59a7fad756dbea1b6bfb39bb2af6`; build ID `_B-XnjLbA-1dhE8lhc2yq`. The baseline retains the original source archive plus recorded asset recovery. The candidate archive plus recorded stylesheet relocation exactly matches the current local source fingerprint.

## Still unrun

There are **zero** authenticated browser acceptance cases and **zero** paired load, interaction or transition timing samples. The run does not prove that pages are slower by the payload percentages, or that latency stayed unchanged. Full HTML/RSC/catalog delivery, navigation/profile requests, keyboard/hydration/mobile behavior and Backend/store acceptance remain unqualified. The failed bundle gates need attention before release.

## Lifecycle and evidence

The approved builder returned to **TERMINATED** after 53.8 minutes, within the one-hour limit. No deployment or cleanup occurred. The 2 GiB artifact staging cap remained in force; read-only dependency inputs and retained tool/dependency/build caches were separately supervised.

Evidence: `gs://continuum-production-477821-creative-benchmarks/i18n/20261112-builder-proof-020240Z/`. The result JSON, all failed/passing logs, source/asset recovery manifests and **365 exact emitted artifact files** are preserved. The client artifact archive was independently verified by byte size and SHA-256 for every file.
