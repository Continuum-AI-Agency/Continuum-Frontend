# Home draft density follow-up

2026-11-19. Frontend base `1b1096e9da477bf20ae302a8b3c86d389d596299` plus uncommitted draft changes. This follows the user request to compress Account health, Goal and oversized headers. The preceding 93.75 council result is historical; this spacing pass was not re-scored.

| Before | After |
| --- | --- |
| Header control boxes dictated a tall header. | Visible header controls are compact; the existing house hit-area utility retains 44px targets, verified beyond the visible button edge. |
| Generous frame padding, gaps and stretched bodies. | Reduced padding and gaps, with frames sized to content inside unchanged board spans. |
| Health names made the default status map tall, with its evidence pushed down. | Compact status cohorts; names remain in hover/focus inspection and List mode. The evidence panel follows the map without a flex spacer. |
| Goal metadata occupied separate grid rows beside a tall plot. | Objective, actual value and reporting window form one summary; the plot is shorter. |
| Inspector margins and tall operational rows added empty space. | Inspector margins are removed and named rows use a compact minimum height. |

## Observed layout

One Chrome observation per theme/viewport before and after; CSS pixels, not a performance benchmark. The selected tile order, states, headline values/currencies and every inspected observation ID/value matched across all four comparisons.

| Metric (desktop light, 1600px) | Before | After | Absolute change | Relative change |
| --- | ---: | ---: | ---: | ---: |
| Health panel height | 718.48px | 388.59px | -329.89px | -45.91% |
| Tile header height | 44.00px | 28.00px | -16.00px | -36.36% |
| Header-to-body gap | 16.00px | 8.00px | -8.00px | -50.00% |
| Panel top padding | 24.00px | 12.00px | -12.00px | -50.00% |
| Goals panel height | 449.38px | 344.50px | -104.88px | -23.34% |

## Validation

- PASS: 41 focused Goal/Health render tests, including current-presentation regressions and draft states/guards.
- PASS: Frontend typecheck, Biome checks for both touched runtime files, and whitespace checks.
- PASS: four Chrome cases (desktop/phone × light/dark), all seven selected tiles ready, no page overflow or uncaught page errors, no blocked business writes.
- PASS: hover/focus, arrows, hold, Escape, reduced motion, list/plot record identity, phone touch emulation, and actual clicks/taps 20px from the header control center within its extended hit area.
- Temporary sessions are revoked, session pins removed, and global brand preference unchanged.

The first after-edit capture caught stale styles during a reload and did not qualify. It and the failed hit-area attempt are retained. The final `compressed/` run waits for the new computed padding, header height, map target width and plot height before checking and capturing.

Before evidence: `/tmp/continuum-home-draft/density-20261119T211504Z-86c83c84/before/`. Final evidence: `/tmp/continuum-home-draft/density-20261119T220544Z-71490de9/compressed/`. Both are copied to the matching prefix under `gs://continuum-production-477821-creative-benchmarks/home-dashboard-draft/`, verified by size, MD5 and generation. Owner: Claighmor / Continuum. Staging budget 128 MiB; the owned warm preview allows at most 1 GiB additional cache growth. No cleanup is authorized or performed.

The preceding full oracle bench remains red as documented in `home-dot-council.md`; it was not rerun for this CSS/layout pass below the 50 GiB heavy-work floor. Native-device and screen-reader qualification remain unrun. No deployment or product changelog entry.
