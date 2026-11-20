# Home dot presentation draft

Status: local development draft, 2026-11-19. The current compression follow-up is documented in [home-dot-density.md](home-dot-density.md); the council score below belongs to the preceding layout. The fixed-rubric council reached **93.75/100**, with both gates passing. Scoped authenticated Chrome presentation checks pass; the independent oracle run completed with two failed checks, documented in the council record. This is an ordinary extension of adaptive Home, not an approved replacement for Continuum's durable design system.

### Initial one-off screenshot, 2026-11-19

The user approved an exception to the disk admission floor for one screenshot. The authenticated Easy Fit draft was captured in Chrome at 1600 × 1200, light theme, with all seven selected tiles ready, 33 evidence dots, and no horizontal page overflow. Membership was verified through the existing Home bench flow. Both temporary sessions were revoked, their session pins removed, the global brand preference verified unchanged, and the owned server stopped afterward. Turbopack could not resolve the checkout's external dependency links; the temporary server used webpack without changing app source.

Capture: `/tmp/continuum-home-draft/capture-20261119T191410Z-96ea74a0/easy-fit-home-draft.png`. Verified GCS copy: `gs://continuum-production-477821-creative-benchmarks/home-dashboard-draft/capture-20261119T191410Z-96ea74a0-webpack/easy-fit-home-draft.png`, generation `1795116160366678`, size `184792`, MD5 `A3Qz3LTLtHOaQRAYOUhHnw==`. Local staging and the isolated app cache were retained.

This initial capture proves one real-data desktop view rendered. Subsequent council captures under `council-20261119T194228Z-cba264a0/round-1-reviewed/` and `round-2-reviewed/` exercise desktop and phone widths in light and dark themes, hover/focus, keyboard arrows, held selection, Escape, reduced motion, accessible plot/list alternatives and no page overflow. Their `browser-checks.json` and `receipts.json` retain exact evidence. The final reviewed candidate is under `council-20261119T203157Z-127d0759/round-3-reviewed/`. They are scoped presentation checks, separate from independent source-to-DOM oracle qualification. See [council record](home-dot-council.md) for the current candidate and outcome.

## Source and route

The implementation is the working-tree diff and new files based on Frontend `1b1096e9da477bf20ae302a8b3c86d389d596299` in this checkout. That base commit alone does not contain the draft.

Rebased onto Frontend main `35d621acb` and ported onto the i18n catalogs: every new draft string lives in `messages/dashboard/{en,es,pt-BR}.json`, and the dot adapters take the dashboard translator.

- [Dashboard route](../src/app/[locale]/(post-auth)/dashboard/page.tsx) passes the presentation through [HomeBoardDataWrapper](../src/components/dashboard/server/HomeBoardDataWrapper.tsx).
- [homePresentation.ts](../src/components/dashboard/home-board/homePresentation.ts) accepts exactly `homeDraft=dots` only when `NODE_ENV` is `development`. The default and production presentation remain `current`; no runtime rollout flag is added.
- [HomeBoard](../src/components/dashboard/home-board/HomeBoard.tsx), [HomeTileFrame](../src/components/dashboard/home-board/HomeTileFrame.tsx), [HomeDots](../src/components/dashboard/home-board/HomeDots.tsx), and [homeDots.module.css](../src/components/dashboard/home-board/homeDots.module.css) contain the local presentation seam.

The local route is `http://localhost:3112/dashboard?homeDraft=dots` while the admitted runner's development server is running. **No server is currently running from this work.** There is no cloud deployment.

## Presentation and interaction

The draft uses rounded panels, restrained lilac recorded observations, coral attention observations, foreground-colored neutral observations, and hollow unknown observations. Text and accessible labels explain state; color is supplementary. Panel styling is scoped to Home's draft context. Existing typography, page chrome, adaptive selection, order, tile sizes, sorting, pinning, and shared Optimizer frame remain authoritative.

Hover or focus a dot to read its source label, value, reporting period, and available freshness. Unreported freshness is explicit. One active record is coordinated across the board. Click toggles a held observation; Escape clears it even after focus moves outside its inspector. Arrow keys move focus through the displayed observations. Buttons expose their full description and pressed state, and the readout announces changes politely. Reduced-motion CSS removes dot transitions; the board retains its existing reduced-motion handling. The scoped Chrome records exercise these behaviors; physical-device and screen-reader qualification remain unrun. Goal and Creative also expose a list of the same observations for closely spaced touch targets. Health groups every check by recorded state, exposes names on wider tiles, and updates its evidence panel during inspection. Small summary panels use their content height within the original board spans.

Read-only applies to business changes. Goal saves/removals, approval and scheduling, promotion, and report/email sending are guarded or disabled in this presentation. The board and module sheets show the read-only explanation. Local sorting, pinning, inspection, sheet navigation, and checklist export remain available.

The [read-only Opportunities queue](../src/components/dashboard/home-board/modules/opps/ReadOnlyQueue.tsx) reuses existing queue models, reads, and evidence views without mounting the normal mutation hosts. It retains recorded-cycle timing/currency, budget rationale, creative briefs, recommendation charts, audience comparisons, platform-card evidence, and every recorded cross-platform move leg. Failed or absent reads remain explicit states.

## Data boundaries and display caps

The draft uses existing hooks, contracts, and domain models through [homeDotItems.ts](../src/components/dashboard/home-board/homeDotItems.ts). It adds no sample data, dependencies, backend, schema, or contracts. Dots describe available observations; an absent read is not a zero or a passing check.

| Surface | Display boundary |
| --- | --- |
| General dot inspectors | First 24 model observations; an overflow message reports the displayed count and total and points to the module. |
| Goal trend | Last seven reported observations from the existing figure window, with reported dates/currency where available. This does not assert seven consecutive calendar days. |
| Organic week | Up to 42 published, scheduled, or waiting records, grouped into the existing seven-day window. |
| Overnight actions | Existing last-24-hour model; general 24-dot display cap. |
| Pacing | Existing plan and currency model; the draft adds recorded-through-date/currency context rather than invented dot data. |

The benchmark oracle independently refetches authenticated source data, then uses the same pure domain/presentation adapters to compare IDs, labels, dates, values, tones, grouping, and truncation with the DOM. It does not derive expectations from the rendered dot attributes. Unverified headline reads fail this draft bench; a missing validation record also fails qualification. Its fallback action-history read stops after 100 pages of 50 and fails if the source window cannot be proven. Independent authenticated source-to-DOM dot comparisons ran and passed. The complete oracle bench remains red; its Organic headline oracle needed an explicit database-only request and the shared sidebar emitted hydration warnings. See the final validation in the council record.

## Running and acceptance

From the monorepo root:

```sh
bun run home:draft:e2e:bench --check
bun run home:draft:e2e:bench
```

The first command checks storage admission only. The second uses [scripts/home-draft-bench.ts](../scripts/home-draft-bench.ts) and [playwright.home-draft.config.ts](../playwright.home-draft.config.ts); use that runner rather than starting the capture configuration directly.

The draft bench selects only Easy Fit Meta (`148583e0-5538-462b-8d3a-acd25b80344e`). It reuses the existing Home bench member/session machinery, verifies brand membership, pins the brand to that session, and checks that the global active-brand preference is unchanged. Session revocation and pin removal are asserted afterward. Membership, session pinning, cleanup and unchanged global preference were exercised by the scoped capture runs; the complete direct-read oracle bench ran separately and remains red. Other brands/modes, widened-window cases, and the Jaina composer are explicitly outside this draft run.

The following table is the historical initial implementation checkpoint, before the authenticated captures above.

| Evidence | Recorded outcome |
| --- | --- |
| Focused local tests, parent run | PASS: 189 distinct tests across 14 files, including interactions, adapters, normal-presentation regression, ready/loading/missing/error states, and read-only guards. The move-only queue case covers four fixture legs. Story's four tests were rerun after its explanation change. |
| Frontend and scoped bench typechecks, parent run | PASS, including the existing Home bench specification. |
| Biome CI and whitespace checks, parent run | PASS: 48 touched files checked; root and Frontend `git diff --check` passed. |
| Storage admission | REFUSED, exit 4: `20,854,939,648` free bytes against required `53,687,091,200` bytes (50 GiB). No live bench, build, server, or capture started. |
| Browser/live acceptance | **UNRUN**: member authentication/membership, real-data reads/oracles, source-to-DOM equality, module evidence, business-write interception, session cleanup, and preference invariance. |
| Visual/accessibility acceptance | **UNRUN**: light/dark at desktop/mobile sizes, reduced motion in Chrome, pointer/keyboard behavior, page overflow, touch targets, and actual rendered contrast. |

The table above does not describe the later Chrome capture checks. Neither those captures nor a council score establish cloud deployment qualification. Full oracle execution requires the 50 GiB admission floor; no cleanup is authorized.

## Artifact custody and recovery

Owner: Claighmor / Continuum. An admitted run declares a unique prefix under `gs://continuum-production-477821-creative-benchmarks/home-dashboard-draft/` and uses `artifact-run.py` with isolated temporary staging and a 2 GiB staging budget. It performs a fresh create-only GCS write and verifies size, MD5, and generation before capture. Closed batches are sealed and uploaded incrementally.

The run records Frontend/workspace HEADs, dirty/untracked source bytes, and a fingerprint before startup, then refuses qualification if source drifts. Its unique Next cache and generated type configuration are retained outside staging; the staging budget does not bound that cache. The supervisor monitors free space and stops the owned job at its floor. Capture files are intentional sealed batches; automatic Playwright screenshots, traces, and video are off. Credentials remain in process memory and are not written into artifacts.

Destination access was separately proven with a create-only 177-byte admission marker, verified by size and MD5 (`ZIFIL3Dy4lSjfiwz+B6aXA==`):

```text
gs://continuum-production-477821-creative-benchmarks/home-dashboard-draft/storage-20261119T184020Z-dd9f60f4/admission.json
generation: 1795113655803620
receipt.json generation: 1795113659526788
local receipt: /tmp/continuum-home-draft/storage-20261119T184020Z-dd9f60f4/receipt.json
declared probe staging budget: 64 KiB
```

That receipt proves destination write access only. It contains no runtime, UI, or data-fidelity proof. Retain local evidence on failed uploads for recovery triage; no automatic deletion is authorized. Removing any source, cache, or evidence requires its own approved, verified recovery path.

`PRODUCT.md`, the existing lowercase `design.md`, and design-system sidecars are preserved. Impeccable reported pre-existing legacy Product Register/schema drift; it was not repaired as part of this draft. This page does not promote provisional lilac/coral choices into global design tokens. No deploy or product changelog entry is part of this work.
