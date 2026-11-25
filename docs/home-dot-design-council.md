# Committed Home draft design council

2026-11-20. Scored target: Frontend `82090d9a92feed32df692dcdf39d0b4ec8f6eb71`, compared with `1b1096e9da477bf20ae302a8b3c86d389d596299`, on `draft/home-dots-design-review`. Three fresh independent `gpt-6-luna` judges used Impeccable's Operate principles and Make Interfaces Feel Better. No runtime changes followed the review. This evaluates the latest compression draft; earlier council scores use a different rubric and are historical.

## Fixed rubric

G1: reuse authenticated reads/models, actual units/windows and explicit unknowns; no invented figures or backend, schema or shared-contract changes. G2: development-only variant, business writes blocked with explanation, default presentation and board selection/ranking/logical sizes/pinning preserved. A gate failure would override the numeric score.

| Criterion | Weight | 0 | 2 | 4 |
| --- | ---: | --- | --- | --- |
| C1 Requested Home experience | 25 | Core modules absent or misleading | Useful treatments with material gaps | Selected modules communicate takeaway, evidence, window and detail path |
| C2 Density and hierarchy | 25 | Dead space or clutter prevents scanning | Clear headline with avoidable spacing or repetition | Compact panels/headers; space follows information value |
| C3 Inspection and accessibility | 20 | Essential evidence unreachable | Main interactions work; alternatives incomplete | Pointer/keyboard/touch inspection, state, Escape, readable labels and usable targets |
| C4 Visual craft and responsiveness | 20 | Incoherent or broken layouts | Consistent direction with visible weaknesses | Restrained reference-inspired craft, coherent states, readable desktop/phone in both themes |
| C5 Integration and evidence | 10 | Unsafe integration or unsupported claims | Focused proof with explicit live gaps | Preserved board behavior and complete green real-data acceptance evidence |

## Council verdict: needs work — 66.25/100

Gates: G1 PASS, G2 PASS, unanimous. All three judges supplied evidence for every criterion; none were excluded. Final scores are medians, weighted as `sum(weight * score / 4)`.

| Criterion | Weight | Skeptic | Tracer | Verifier | Final | Evidence / note |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| C1 Requested Home experience | 25 | 3 | 3 | 3 | 3 | Seven selected tiles in `compressed/desktop-light.png`; `HomeBoard.tsx:134`, module adapters and direct-read oracle. Unselected module variants have no live capture qualification. |
| C2 Density and hierarchy | 25 | 2 | 2 | 3 | 2 | Captured Health/Goal layouts retain avoidable visual spacing; compact headers already measure 28px with 44px hit areas. |
| C3 Inspection and accessibility | 20 | 3 | 3 | 4 | 3 | `HomeDots.tsx:139`, recorded hover/focus/hold/Escape, reduced motion, List alternatives and emulated touch checks. |
| C4 Visual craft and responsiveness | 20 | 3 | 3 | 2 | 3 | Four light/dark desktop/phone captures; visible desktop grid gaps and a phone viewport dominated by framing/Ask content. |
| C5 Integration and evidence | 10 | 2 | 2 | 3 | 2 | Existing selection/sizes retained; focused validation green; complete real-data acceptance remains red. |

## Top issues

1. Remaining desktop whitespace: a conspicuous blank band sits below Health while Goal/Pacing fill the right side. Confirmed in the desktop capture and `HomeBoard.tsx:138`, which retains `BOARD_SIZE_CLASS`, together with content-height frames in `homeDots.module.css:23`. Preserving the requested logical row spans contributes to that gap; more header-padding reduction alone will not close it. The Health status map and Goal plot also retain room for a further density pass. Raised by all judges; source/capture verified.
2. Phone scan starts late: the draft notice, mode/sort controls and expanded Ask suggestions precede Account health. Confirmed in `compressed/phone-light.png` and `HomeBoard.tsx:85-122`. Raised by the Skeptic; capture/source verified. Lower-module visual readability has only partial screenshot coverage.
3. Complete real-data acceptance remains red. The recorded oracle run has 58 PASS, 7 WARN, 0 SKIP and 2 FAIL: the Organic headline oracle required an explicit database-only request, and the shared sidebar emitted hydration warnings. The oracle request was corrected; its full rerun remains UNRUN. See [the recorded acceptance boundary](home-dot-council.md). Raised by all judges; record/source verified, not rerun today.

## Disputes and evidence corrections

- No gate split or criterion spread reached two points, so no score replacement was required.
- The Tracer said touch was not demonstrated. Both phone entries in `compressed/browser-checks.json` explicitly contain `emulatedTouch: true, physicalDevice: false`. Touch emulation is recorded proof; native-device and screen-reader qualification remain UNRUN. The unsupported broader touch finding is excluded; the median score is unchanged.
- Brief/Market/Setup/Checklist not being selected in this Easy Fit board is a live-coverage gap, not a failure to render the selected seven modules. Selection rules must remain intact.
- Header controls are already visually 28px high, with measured 44px hit areas. Residual whitespace should not be described as an uncompressed 44px tile header.

## Validation and source custody

This turn passed staged `agent:check -- --scope Continuum-Frontend` (48 Biome targets and related focused tests), the slotted Frontend typecheck, and whitespace checks. Judges inspected source and recorded browser evidence; they did not perform a fresh live browser run. Current disk free space was 40,909,709,312 bytes, below the 53,687,091,200-byte admission floor. No new heavy build, live benchmark, capture, cleanup, deployment or changelog entry was performed.

All 51 implementation files exactly matched the final capture source snapshot before commit: `/tmp/continuum-home-draft/density-20261119T220544Z-71490de9/final-source.json`, fingerprint `2c4d4c250845ad9c362f10660268a4318461945617747d1bc8d4bccd1f0a81cf`. Captures and checks are in its `compressed/` directory. Data is recorded as of that capture, not newly refreshed backend data. Both themes and viewports were reviewed.

The separate root launcher commit initially failed its normal lockfile hook because the unrelated Watchman checkout has no `package.json`. Root and Frontend dependency/workspace fields and both lockfiles are unchanged; the script-only root commit used a documented hook override. The root render-contract check also reports existing vendored contract drift; `git diff 1b1096e9..82090d9a -- packages/contracts` is empty. Those unrelated contracts and Watchman work were preserved. The final root checkpoint pins the Frontend commit so its launcher resolves to the committed runner. Nothing was pushed or merged.

Evidence owner: Claighmor / Continuum. Isolated staging: `/tmp/continuum-home-draft/commit-council-20261120T211404Z-e2b86c9d`, budget 8 MiB. Approved destination, create-only write verified before review: `gs://continuum-production-477821-creative-benchmarks/home-dashboard-draft/commit-council-20261120T211404Z-e2b86c9d/`. The common judge brief, scores, source identities, validation summaries and this report are retained there with generation/size/checksum receipts; local evidence is retained.
