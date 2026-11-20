# i18n source checkpoint — 2026-11-12

This checkpoint isolates complete-app UI localization from the shared dirty working tree. It is based on Frontend `31690a080968339505b0508a22b8eb3d3106fd35`, rather than replacing current beta. English, Brazilian Portuguese and Spanish use pinned next-intl 4.15.0, precompiled static catalogs, account/browser preferences and active-language feature delivery.

Only i18n changes are carried from the preserved pre-migration snapshot. Existing uncommitted music/replay/editor capabilities are excluded. Original render-placement algorithms, editor draft states and available render resolutions retain their behavior. Nineteen catalog keys preserve original Forge wording and pixel-dimension formatting; prose drafts came from the previously authorized offline Google Translation workflow and were reviewed for ICU arguments, pluralization and domain terms. Original draft payloads and receipts are retained in the evidence prefix below.

## Source verification

- Catalog/ICU/scope/literal checks pass with zero failures, zero untranslated UI literals, zero translated machine values and the existing 82 narrow literal exceptions.
- Slotted type generation and Frontend typechecking pass using the existing monorepo dependencies.
- Focused contract, UI-language, original placement, approval/scheduling, formatting and Backend error-response tests pass. Candidate Biome hygiene and both isolated frozen-lockfile checks are recorded separately in the evidence.
- Comparison videos do not expose caption-track metadata. Two existing caption-track lint violations have narrow, documented suppressions; the controls have translated accessible labels. No caption text or track was fabricated.

## Deployment remains unqualified

The earlier [gzip optimization measurements](i18n-gzip-optimization.md) apply to their recorded source fingerprint, including pre-existing uncommitted app changes. This isolated commit differs and needs a new standalone production build, bundle measurement and real authentication/Backend/store/editor end-to-end run. Its production build, browser acceptance and paired runtime performance are UNRUN. The earlier snapshot's unchanged Organic/Scale route gates failed; no budgets have been raised. A source check or commit is not deployment evidence.

Local build admission is blocked below the unchanged 50 GiB root-disk floor. The previously authorized builder run already ended within its one-hour window. A new builder start needs authorization; no cleanup is included. Performance claims must follow the current strobe policy. The application and canonical benchmark source are retained without claiming new timing results.

The source checkpoint is intended for an i18n preview branch. Current beta has newer UI surfaces that require additional localization and acceptance; beta/main promotion is a separate integration gate. Source preservation pushes must not be mistaken for a qualified deployment.

Evidence owner: Claighmor/i18n. Destination: `gs://continuum-production-477821-creative-benchmarks/i18n/20261112-commit-release/`. Original shared source and all prior experiments remain retained. Commit isolation uses separate worktrees and indexes; manual candidate checks preserve the same scoped hygiene/type/catalog/lockfile requirements without running hooks against the unrelated main checkout.
