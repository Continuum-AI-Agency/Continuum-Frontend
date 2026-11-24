# Home dashboard council record

Owner: Claighmor / Continuum. Local development draft, 2026-11-19. Frontend base `1b1096e9da477bf20ae302a8b3c86d389d596299` plus this checkout's uncommitted changes. No deployment or commit is part of this work.

## Fixed rubric and method

Three fresh independent Luna judges per round: skeptic, requirements tracer, verifier. Judges inspect the reference, current Chrome captures, source, and recorded checks. They receive no earlier scores or desired total. The rubric stays fixed. Scores describe the local presentation; they are not statistical measurements or production qualification.

- **G1 Real-data honesty:** displayed observations preserve source meanings and missing/stale/unknown states; no invented numbers/history or hidden freshness claims.
- **G2 Home/safety scope:** existing selection/ranking/sizes/pinning authority and development-only/read-only business boundary remain preserved.

| Criterion | Weight | 0 anchor | 2 anchor | 4 anchor |
| --- | ---: | --- | --- | --- |
| C1 Dynamic experience | 30 | Static figures dominate; no evidence exploration | Some exploration, limited visual change | Evidence drives an engaging explorable board consistent with the reference and modular constraints |
| C2 Meaningful encoding | 25 | Marks add no information or fabricate it | Readable status/counts, limited relationships | Position/grouping/annotations reveal actual differences and meaningful structure |
| C3 Interaction/feedback | 20 | Inert or unclear | Basic hover/selection | Immediate legible pointer/keyboard exploration conveys entity/value/period/available freshness with appropriate feedback |
| C4 Hierarchy/space | 15 | Competing labels or empty panels dominate | Clear structure, uneven density | Strong takeaways, compact evidence and selective accents use space purposefully |
| C5 Accessible/responsive | 10 | Essential interactions inaccessible | Keyboard/reduced-motion support, with gaps or unverified widths | Readable/usable across input methods and widths, with explicit unknown states |

Each criterion uses 0–4; 1 and 3 are intermediate. Final criterion score is the median of evidenced votes. A spread of at least two, or a gate split, requires primary evidence review and a ruling. Weighted score is `sum(weight * final / 4)`. Any failed gate fails the round regardless of score.

## Iterations

| Round | Skeptic C1–C5 | Tracer C1–C5 | Verifier C1–C5 | Median C1–C5 | Score | Gates |
| --- | --- | --- | --- | --- | ---: | --- |
| Initial | 2/2/2/2/2 | 2/2/2/1/2 | 2/2/2/2/2 | 2/2/2/2/2 | 50/100 | PASS/PASS |
| 1 | 4/3/4/2/3 | 3/3/4/2/3 | 3/3/3/2/3 | 3/3/4/2/3 | 76.25/100 | PASS/PASS |
| 2 | 4/3/4/2/3 | 4/3/4/3/3 | 4/3/4/2/3 | 4/3/4/2/3 | 83.75/100 | PASS/FAIL after ruling |
| 3 | 3/3/4/3/3 | 4/4/4/3/4 | 4/4/4/3/3 | 4/4/4/3/3 | **93.75/100** | **PASS/PASS** |

| Comparison | Baseline | Result | Absolute change | Relative change | Source |
| --- | ---: | ---: | ---: | ---: | --- |
| Initial to round 1 | 50/100 | 76.25/100 | +26.25 points | +52.5% | Three judges per round, fixed rubric |
| Round 1 to round 2 | 76.25/100 | 83.75/100 | +7.5 points | +9.84% | Three judges per round, fixed rubric; round 2 failed G2 |
| Round 2 to round 3 | 83.75/100 | 93.75/100 | +10 points | +11.94% | Three judges per round, fixed rubric; both final gates pass |
| Initial to final | 50/100 | 93.75/100 | +43.75 points | +87.5% | Three judges per round, fixed rubric |

Round 1 replaced uniform dot strips with actual-date revenue observations, creative verdict/spend positioning, coordinated anchored inspection, keyboard traversal and list alternatives. The reviewed images are under `/tmp/continuum-home-draft/council-20261119T194228Z-cba264a0/round-1-reviewed/`.

Round 2 clarified the health denominator, added status cohorts with a persistent evidence panel, and tightened the goal layout. Evidence: the same run's `round-2-reviewed/`. The skeptic alone failed G2: Opportunities still linked to the normal business decision surface. Primary review confirmed the link in the tile and expanded sheet, so the gate failed despite two passing votes. There were no criterion spreads requiring a ruling.

The round 3 candidate removes those decision/creation links in draft mode, keeps inspection in the read-only sheet, adds Escape after focus leaves the inspector, and makes all plots available as lists. Health shows recorded check names on wider tiles and uses a compact map on phones. Tile header controls are at least 44px. Short panels use content height within unchanged board spans. Operational records use named status rows with a bounded scroll area. Organic distinguishes published/scheduled totals from waiting drafts.

## Current evidence

Round 3 staging: `/tmp/continuum-home-draft/council-20261119T203157Z-127d0759/`. Approved destination: `gs://continuum-production-477821-creative-benchmarks/home-dashboard-draft/council-20261119T203157Z-127d0759/`. Owner and budgets were declared before capture: 128 MiB staging and 1 GiB additional warm-cache growth. Artifacts upload incrementally, with size, MD5 and generation verified. No cleanup is authorized.

The current reviewed captures and checks are recorded in `round-3-reviewed/`. Earlier failed attempts and `round-3-proof/` are retained; they are not substituted for the final reviewed candidate.

The Chrome checker uses authenticated Easy Fit Meta data, verifies membership, pins only its own session, and asserts session revocation, pin removal and unchanged global brand preference. It checks four dot inspectors at desktop 1600×1500 and phone 390×844, both themes, keyboard focus/arrows/hold/Escape, reduced motion, no page overflow and minimum tile-control sizes. Phone checks additionally dispatch actual CDP touch events under Chrome touch emulation. Accessibility-tree snapshots record semantic labels and states; they do not claim screen-reader qualification.

Frontend and scoped bench typechecks pass. The final focused run passed **215 tests across 15 named files**, with no failures or React act warnings. It covers ready/loading/missing/error, adapters, interactions, normal presentation and business guards. Biome checked 48 touched files; root and Frontend whitespace checks passed.

The final median scores are C1=4, C2=4, C3=4, C4=3, C5=3. Every final criterion has three evidenced votes, no spread reaches two, and both gates pass unanimously. No final-round ruling or excluded judge was needed. The target of at least 90 is met for the local presentation.

Remaining notes: a held phone callout can overlap chart annotations; phone health check names require inspection or List mode; the existing phone page-header caption truncates. Native-device and screen-reader qualification remain unrun. The final panel reviewed a changed candidate, with the same rubric and independent fresh judges.

The independent oracle attempt `home-draft-20261119204418100-79691eed` was interrupted after diagnosing a runner configuration error: the canonical machine env names `localhost:4000`, while the reviewed capture used the deployed API. Six ready headline comparisons and board order passed, but Organic failed with that absent backend and the backend Home reads were unexercised. The session was revoked, pins removed and global preference checked unchanged before shutdown. Staging and its failed validation record are retained. The draft runner now explicitly selects `https://api.trycontinuum.ai`; the subsequent real-read run is recorded below. No app data or oracle expectation was changed to hide the failure.

Physical phones, screen readers and production deployment remain unexercised. No synthetic figures or production fixtures were added.


## Final criterion reconciliation

| Criterion | Weight | Skeptic | Tracer | Verifier | Final | Evidence |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| C1 Dynamic experience | 30 | 3 | 4 | 4 | 4 | Dated revenue plot, verdict/spend plot, health map and day-grouped posts in reviewed captures |
| C2 Meaningful encoding | 25 | 3 | 4 | 4 | 4 | Actual dates/values, recorded spend shares/verdicts, actual check and post states |
| C3 Interaction/feedback | 20 | 4 | 4 | 4 | 4 | Anchored callouts, one held record, arrows, Escape including outside the inspector; Chrome checks |
| C4 Hierarchy/space | 15 | 3 | 3 | 3 | 3 | Strong primary modules and compact secondary panels; health remains the largest information-dense tile |
| C5 Accessible/responsive | 10 | 3 | 4 | 3 | 3 | Four theme/width cases, keyboard, reduced motion, touch emulation, 44px controls and accessibility trees; native-device/SR limits retained |

## Final validation and acceptance boundary

| Check | Result |
| --- | --- |
| Council | **93.75/100; G1 and G2 PASS unanimously**. No excluded vote or final-round dispute. |
| Focused source tests | 215/215 across 15 named files; the Organic calendar helper file adds 6/6, including the explicit database-only boundary. 221 distinct tests across 16 files. |
| Frontend / bench typechecks | PASS. The scoped bench typecheck was rerun after the oracle request correction. |
| Formatting / whitespace | PASS: 48 touched source/config files checked, then both changed bench files checked again. Root and Frontend whitespace checks pass. |
| Reviewed Chrome presentation | PASS: desktop 1600×1500 and phone 390×844, both themes; four inspectors per case; two emulated-touch cases; no page overflow; header controls at least 44px. |
| Full real-data oracle run | **RED**: 58 PASS, 7 WARN, 0 SKIP, 2 FAIL. Run `home-draft-20261119205232520-b01827d4`; source stable, fingerprint `ec7db9bdab2229a2e47b8369bab642426717f92e4041512c81abdfd90d2c8cd1`. |
| Real observations | PASS: every displayed dot's IDs, counts, dates, numeric values, labels, statuses, grouping and truncation matched independently refetched authenticated data. Six headline comparisons passed; Organic's legacy headline oracle used a different request mode. |
| Sheets / board behavior / safety | PASS: all seven sheets, weekly story, existing order, all three sort modes, local pin through reload, read-only business controls and no production write attempted. |
| Auth cleanup | PASS: session revoked, session pins removed, global preference unchanged. Owned servers stopped. |
| Repeat heavy-run admission | REFUSED: 52,862,844,928 free bytes against 53,687,091,200 required (50 GiB). No cleanup or admission bypass. |

The Organic failure was `rendered 0, direct 1`: Home and the independent dot oracle explicitly request stored posts only. The legacy headline oracle omitted `includeExternal`, which makes the API fall back to provider posts when its database result is empty. Its request now explicitly uses `includeExternal: false` and `forceRefreshExternal: false`, matching Home. The existing helper tests prove that contract. A full live rerun after this correction is **UNRUN** because the heavy-work admission floor is no longer met.

The other failure is the shared sidebar's server/client opacity hydration warning under reduced motion. The runtime trace names `AppSidebarInner`; `AppSidebar.tsx` is unchanged against base `1b1096e9`. This is source evidence of an issue outside the draft surface; a clean-baseline browser rerun was not performed. The full console gate remains failed. It has not been weakened or reclassified as a passing check.

The seven selected modules were health, goals, pacing, overnight, creative, opportunities and organic. Checklist, Brief, Market and Setup were not selected by this brand's unchanged relevance rules and were not live-exercised as tiles. Overnight had no recorded actions, so positive recorded-action evidence was not live-exercised. No saved target existed; save/remove guards were covered by focused tests, with business writes intentionally unexercised. Native devices, screen readers and production deployment remain unexercised. Some stored Meta thumbnail URLs were expired; the existing placeholder rendered and the bench retained that warning.

At the council checkpoint, no application runtime source had changed after the reviewed capture: all 41 changed files under `src/` matched the reviewed source manifest. Subsequent changes were the bench endpoint, its database-only Organic oracle request, and this evidence documentation. The final source snapshot and verified receipts are retained under the council run's GCS prefix. Failed/interrupted run results are retained locally and in GCS; no data or cache was removed.

Local route: `http://localhost:3112/dashboard?homeDraft=dots` in development. The owned preview/bench server is stopped after validation. The normal dashboard remains the default, production ignores the draft parameter, and the separate diverged main checkout is preserved. This is a local draft with a passing presentation council, **not full end-to-end or deployment qualification**.


The later compression follow-up is recorded in [home-dot-density.md](home-dot-density.md). It changes the draft layout and does not inherit this historical council score.
