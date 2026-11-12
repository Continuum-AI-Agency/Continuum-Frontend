# i18n gzip optimization — 2026-11-12

Historical source cohort only. These measurements do not qualify the later beta integration described in [the release checkpoint](i18n-release-checkpoint.md).

The added shared initial JavaScript fell from **15,418 to 10,085 bytes gzip** (15.06 → 9.85 KiB), a **34.6% reduction**. The original **10,240-byte / 10 KiB limit is unchanged** and passes in this controlled local comparison, with 155 bytes of headroom. `next-intl` remains pinned at 4.15.0. This result is not a zero-overhead claim or completed release qualification.

## Measured JavaScript

| Route | Pre-i18n | Before optimization | Final | Saved by optimization | Remaining over pre-i18n |
|---|---:|---:|---:|---:|---:|
| `/login` | 235.17 | 300.27 | 253.01 | 47.26 | +17.84 |
| `/dashboard` | 971.09 | 1017.83 | 1012.86 | 4.98 | +41.76 |
| `/organic` | 940.94 | 1036.00 | 998.95 | 37.04 | +58.01 |
| `/scale` | 894.21 | 916.03 | 910.83 | 5.20 | +16.62 |
| `/library` | 1073.55 | 1107.00 | 1103.39 | 3.61 | +29.84 |
| `/forge` | 1057.31 | 1083.43 | 1077.33 | 6.10 | +20.01 |
| `/ai-studio` | 799.41 | 822.14 | 816.94 | 5.20 | +17.53 |
| `/settings` | 1477.01 | 1498.87 | 1493.87 | 5.00 | +16.86 |

All table values are **KiB gzip**. Exact byte counts and chunk lists are in `final/results.json` under the evidence prefix below. This sums individually gzip-compressed emitted first-load JavaScript chunks; it does not measure HTML/RSC/catalog transfers, total browser traffic, execution time or latency. These deltas cover complete source snapshots, including their dependency/import graph changes, rather than attributing all bytes to the translation package alone.

Shared means the common first-load chunk intersection across dashboard, Organic, Scale, Library, Forge and AI Studio. Total shared JavaScript is 680,410 bytes before i18n, 695,828 before optimization and 690,495 after optimization. The smaller `rootMainFiles` bucket is not used to claim this limit passes.

## Changes retained

- Use the existing radio group for the three language choices, removing the popup select's heavy import graph from login. Preserve labelled controls, pending state, validated Server Action persistence, refresh after success and the existing language on failure.
- Move Organic's format label helper into a small presentation module so bulk plan cards no longer import the full concept card and its media dependencies.
- Use native Next links/router with the existing cookie-based, never-prefixed locale routing. Normalize internal locale paths in the pathname hook. `next-intl` continues to handle translation, ICU precompilation and locale middleware.
- Split browser language negotiation from the tiny client locale configuration, lazily allocate formatter caches, remove redundant translated product-name lookups and use short descriptive navigation keys. Translated values, currency identity/precision and Jaina's separate report-language behavior are preserved.
- Keep one active UI language and source-derived feature slices in normal providers. Lazy editors retain their active-language loaders and existing boundaries. The provider-independent global error dictionaries remain the documented 412-byte source-JSON exception.

An `optimizePackageImports` experiment for contracts produced no useful saving and was removed. No dependency, lockfile or bundle-budget increase was introduced.

## Controlled source and dependencies

All nine local snapshots use the same existing monorepo dependency tree: Next **16.3.5**, Bun **1.4.2**, Node **v22.23.3**. Root lockfile SHA-256: `af5a2f8beb988b1365b1d78aca0f440f55d3baf6720c7d6d4697421855eabd8c`. Final build ID: `UaySMyuEJCtzBMa9IaxOT`. Source fingerprints cover the actual snapshotted source/catalogs/configuration. The preserved pre-i18n fingerprint matches the recovered historical baseline.

| Snapshot | Source SHA-256 | Shared gzip bytes | Added over pre-i18n |
|---|---|---:|---:|
| pre-i18n | `2af8b1a9f9f0e631060490359aa8ae6000a7e0fc7eaa4e9a55d7959f433623db` | 680,410 | +0 |
| before | `c1b26ff642e0db218b3cb9ba9b77005732a532963ca6fe9610af9f7aea48455c` | 695,828 | +15,418 |
| after | `9937ef51d0fe05d98c9efae04149a8cc9e0ed98b05a65bd0b467f016e45e7a0b` | 695,853 | +15,443 |
| after-barrels | `c5cceee9fc51b6afdf19336786ead12cf390883d5f8af985a9ddae68b59d9dd0` | 695,857 | +15,447 |
| after-navigation | `5ba6c81e3dd6c0f2c1f80d710cfacaa64a7d9fba5312b535d41de35bbe8d2558` | 691,501 | +11,091 |
| after-final | `c11f61949d4d25a80f68d2e4258e8a8fc9fbc452837590c40307b0abfcd283b8` | 690,762 | +10,352 |
| after-brands | `6bc86ab456c792b3edd95e73d2a5ee9b67afeea2e0889cfcbf8d46056f613fbe` | 690,682 | +10,272 |
| after-matcher | `0c77dc65a8696a29a91a3c71d2304c62a9e4d3023857de97ba5cf7e95282ced9` | 690,655 | +10,245 |
| after-keys | `bf8ff459ed6417a37954536e2cb9f7d358beec6e699f57adc74cc5fd2a6bfe88` | 690,495 | +10,085 |

The exact original route budget configuration is identical in every snapshot: SHA-256 `3ccbaabc57843a1147e38a23c9db6976d063270bd8ff99dc1942f42d6aac4fa6`. The earlier [standalone ARM64 builder results](i18n-production-bundle-results.md) used the Frontend's separate Next 16.3.1 lockfile; those values must not be mixed with this local cohort. A fresh standalone install/build remains required.

## Validation and remaining gates

Catalog/ICU/literal checks, focused behavior tests, scoped checks, the slotted Frontend typecheck, benchmark-script typecheck and both sanctioned lockfile checks passed. Production compilation/prerendering and the build's typecheck completed. Focused coverage includes all active-locale lazy boundaries, navigation and deep links, locale negotiation, language persistence/failure, authentication preference restoration and existing money/decimal formatting behavior.

The final compiled production source passed **seven anonymous Chrome observations**: English login, saved Portuguese preference, keyboard navigation to Portuguese privacy, Spanish at 375×812 without horizontal overflow, an offline save failure preserving the Spanish cookie/UI and showing Spanish guidance, recovery to English and keyboard navigation to English terms. There were no browser-thrown errors and no translation JSON fetches or profile lookups in this observed anonymous flow. The production server used local-only configuration; this does not exercise real authenticated accounts, the Backend or stored application data.

The full production build still exits 1 at unchanged route budgets: the misleadingly named “authenticated dashboard route” gate targets **Organic**, which exceeds its uncompressed limit by **53,702 bytes**; Scale exceeds by **44,939 bytes**. The recovered pre-i18n baseline already exceeds Scale by 806 bytes with these installed dependencies. Other existing bundle gates pass. Do not treat the shared gzip pass as a green full build.

There are **zero paired browser timing samples**. Real authentication, account switching, a second account session, Backend/store/editor workflows, stored currency/timezone acceptance and the ten-pair p75 timing gate remain **UNRUN**. This proves a payload reduction and bounded anonymous behavior, not unchanged application performance. No deployment occurred.

## Evidence and resource custody

Owner: Claighmor/i18n. Approved evidence prefix: `gs://continuum-production-477821-creative-benchmarks/i18n/20261112-gzip-slim/`. The final report, measurements, Chrome observations and source/build/client artifact receipts are under `final/`. Uploads are create-only and verified by byte size, MD5 and object generation; per-client-file SHA-256 manifests are retained.

The 50 GiB root-disk admission floor and 2 GiB isolated artifact staging cap were retained. Final artifacts use a quota-backed RAM staging mount; all earlier snapshots/caches remain retained. The separately supervised RAM cache cap rose from 6 to 7 GiB to retain the last comparison without deleting earlier caches. No cleanup occurred. The previously approved one-hour builder session had already ended; these measurements did not restart that VM.
