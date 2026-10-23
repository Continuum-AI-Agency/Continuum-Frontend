# Multiplatform Optimizer fixtures

Seed data for the 30 scenarios in `docs/optimizer-multiplatform/escenarios.html`.
`scenarios.json` maps each scenario number to the files below; it is generated from the page.

Every file is `{ "_source": {...}, "data": ... }`. `_source.kind` is one of:

- **`REAL`** — recorded read-only on 2026-10-01. `data` is the API response as returned.
- **`DOC_SHAPED`** — TikTok Marketing API v1.3 shapes, labelled `doc-shaped, not live`. No pilot
  advertiser is connected (the TikTok app review is pending), so the ids are invented and say so.
- **`SYNTHETIC`** — composed for a scenario where no real source exists. `_source.anchoredTo` names
  the REAL file it leans on and `_source.invented` lists what was made up.

No file carries a token or secret (the recorder refuses to write one) and third-party emails are
masked (`a***@domain`). To re-record: `scripts/optimizer-multiplatform-fixtures/README.md`.

## Google — REAL (GAQL v25 `googleAds:search`, `SELECT` only)

Read through Ramiro's Google integration `969c4213` (the only one that reaches these customers;
it is granted to the Funeraria Tangassi brand), each customer under its own `login-customer-id`.
The exact query is in each file's `_source.query`. 30-day window = 2026-09-01..2026-09-30,
14-day = 2026-09-17..2026-09-30.

| File | Customer | What |
|---|---|---|
| `google-vivo47-customer.json` | Vivo 47 `3710693645` | currency MXN, timezone, test_account false |
| `google-vivo47-campaigns30d.json` | Vivo 47 | 17 campaigns: status, primary status + reasons, channel type, bidding + system status, budget ref, cost/conv, search IS and lost IS |
| `google-vivo47-campaignDaily14d.json` | Vivo 47 | per-day cost/conv and lost IS (VIVO 47-EKATAR 29.1% on 2026-09-28) |
| `google-vivo47-budgets.json` | Vivo 47 | 24 budgets incl. the shared 12280387431 (3 campaigns) |
| `google-vivo47-keywords30d.json` | Vivo 47 | 380 keywords with Quality Score ("Entrenamiento funcional" QS 1, PAUSED) |
| `google-vivo47-conversionActions.json` | Vivo 47 | 22 conversion actions, category, primary_for_goal |
| `google-easyfit2026-customer.json` | Easy Fit 2026 `5251780631` | currency MXN |
| `google-easyfit2026-campaigns30d.json` | Easy Fit 2026 | 7 ENABLED campaigns, 0 spend; GA 1 EASY in LEARNING_NEW |
| `google-easyfit2026-campaignsAll.json` | Easy Fit 2026 | same campaigns without a date segment |
| `google-easyfit2026-budgets.json` | Easy Fit 2026 | 11 budgets |
| `google-easyfit2026-conversionActions.json` | Easy Fit 2026 | 9 actions incl. the GA4 purchase import |
| `google-tangassi-customer.json` | Grupo Tangassi `9343596627` | currency MXN |
| `google-tangassi-campaigns30d.json` | Grupo Tangassi | Search Landing-Goto (BUDGET_CONSTRAINED) + PMax Necesidades SLP |
| `google-tangassi-campaignDaily14d.json` | Grupo Tangassi | per-day spend (PMax 240 on a 120 budget) |
| `google-tangassi-budgets.json` | Grupo Tangassi | 3 unshared budgets |
| `google-tangassi-assetGroups30d.json` | Grupo Tangassi | PMax asset groups: status, primary status + reasons, metrics |
| `google-tangassi-conversionActions.json` | Grupo Tangassi | calls / local actions |

## Meta — REAL (prod Supabase, public `optimizer_*` read RPCs)

Easy Fit pilot account `act_521903353286118`, both Easy Fit brand profiles. RPCs:
`optimizer_list_portfolios`, `optimizer_load_portfolio`, `optimizer_list_portfolio_adsets`,
`optimizer_get_portfolio_performance(p_limit 30)`, `optimizer_get_cpa_series(p_limit 30)`.

| File | Portfolio |
|---|---|
| `meta-easyfit-portfolios.json` | the 6 portfolios on the account, as listed |
| `meta-easyfit-portfolio-mensajes-todos.json` | MENSAJES // TODOS — conversations, autopilot |
| `meta-easyfit-portfolio-formularios-todos.json` | FORMULARIOS // TODOS — lead, autopilot (D2 rec on ITESO LKL) |
| `meta-easyfit-portfolio-septiembre-tours-programados.json` | Tours — purchase, autopilot, 0 purchases, roster absent |
| `meta-easyfit-portfolio-prueba.json` | Prueba — lead, recommend |
| `meta-easyfit-portfolio-citas-agosto-check-leads.json` | Citas Agosto — 57 days stale |
| `meta-easyfit-portfolio-reporte-agosto-citas-y-mensajes.json` | Reporte Agosto — empty roster |

## TikTok — DOC_SHAPED (Marketing API v1.3, not live)

| File | Endpoint |
|---|---|
| `tiktok-campaign-get.json` | `GET /campaign/get/` — manual lead gen, upgraded Smart+, manual engagement |
| `tiktok-adgroup-get.json` | `GET /adgroup/get/` — 5 ad groups incl. a 3-day-old one and one with a 1-day click window |
| `tiktok-report-adgroup-14d.json` | `GET /report/integrated/get/` BASIC, AUCTION_ADGROUP, 14 days |
| `tiktok-report-adgroup-7d.json` | same, 7 days — 201+202 cost per lead is 1.50× the REAL Meta d7 |
| `tiktok-report-adgroup-today.json` | same, today at 21:40 — the 105% spend floor input |
| `tiktok-ad-get.json` | `GET /ad/get/` — ads 301–306 of ad groups 201–203 (wave 8, `build-tiktok-creative-days.mjs`) |
| `tiktok-report-ad-daily-14d.json` | AUCTION_AD by ad_id × day, 14 days — 2 s hold, frequency; each ad shaped to one side of T1/T3 |

## Wave 8 platform signals — REAL (escenarios 31–35, 38)

| File | Read |
|---|---|
| `google-vivo47-searchTerms14d.json` | `search_term_view`, 14 days — G05 negatives, promote |
| `google-vivo47-keywordsQs14d.json` | `keyword_view` with `quality_info.quality_score`, 14 days — G11 |
| `google-vivo47-bidding14d.json` | campaign bidding + tCPA + rank-lost share, 14 days — G07 |
| `google-vivo47-bidChanges30d.json` | `change_event` on campaigns, 30 days — no bid-target change |
| `google-tangassi-assetCoverage.json` | `asset_group.ad_strength` + `asset_coverage.ad_strength_action_items` — PMax coverage |
| `tiktok-easyfit-organic-posts.json` | prod `organic.tiktok_videos` (@easyfit_oficial, 20 posts, lifetime views) — T5 |

## Wave 9 delivery and policy — REAL (escenarios 41, 42) and DOC_SHAPED (43, 44)

Recorded 6 Oct 2026 by `record-google-delivery.mjs` (the `google_signals` scope's own three
delivery statements — the scenario bench fails if they drift) and written by
`build-tiktok-delivery.mjs`.

| File | Read |
|---|---|
| `google-easyfit2026-deliveryCampaigns.json` | every ENABLED campaign: `primary_status`, reasons, `serving_status` (6 SUSPENDED, the Video ENDED), budget, start |
| `google-easyfit2026-deliveryDaily30d.json` | impressions per campaign per day, 30 days — 0 rows: the account showed nothing |
| `google-easyfit2026-adPolicy.json` | ads `DISAPPROVED` / `APPROVED_LIMITED` in enabled campaigns — 0 rows |
| `google-easyfit2026-adApprovals.json` | census of all 76 ads' `approval_status` |
| `google-easyfit2026-signals-dark.json` | the whole `google_signals` answer (`PlatformSignals`) from `scripts/optimizer-multiplatform/fixtures/google-signals-recorded.json`, its asset group as read live later on 6 Oct: GA1 EASY AVERAGE with six missing items while every campaign that should serve is SUSPENDED — the G12 account card stands alone |
| `google-vivo47-deliveryCampaigns.json` | VIVO 47-EKATAR, `ELIGIBLE` / `SERVING`, 1,179 MXN/day |
| `google-vivo47-deliveryDaily30d.json` | impressions per day, through the last day |
| `google-vivo47-adPolicy.json` | 0 refused ads |
| `google-vivo47-adApprovals.json` | census of all 56 ads — none `DISAPPROVED` or `APPROVED_LIMITED` |
| `tiktok-delivery-adgroup-get.json` | DOC — ad groups 206–208 with `secondary_status` and budget |
| `tiktok-delivery-ad-get.json` | DOC — ads 307–310 with `secondary_status` (307 `AD_STATUS_AUDIT_DENY`) |
| `tiktok-delivery-report-ad-daily-14d.json` | DOC — AUCTION_AD by ad × day; 309 stops serving after 28 Sep |
| `tiktok-delivery-review-info.json` | DOC — `/ad/review_info/` for 307: `is_approved=false`, reason and suggestion |

### G7 — ads, PMax assets, weekly frequency, the b9cebbcf campaigns (escenarios 45–49)

Recorded 20 Oct 2026 by `record-google-signals.mjs --g7`: the `google_signals` scope's own G7
statements (`paid-media-metrics/google/signals.ts`), 30 days for ads and assets, the last 7 for
frequency, all ending 19 Oct; plus Easy Fit 2026's ENABLED campaigns and their 14 days, because
the b9cebbcf campaigns started 6 Oct, after the 1 Oct campaign recording.

| File | Read |
|---|---|
| `google-vivo47-adCatalog.json` | EKATAR's 4 ads in 4 ad groups, 2 ENABLED: one enabled ad per group |
| `google-vivo47-adMetrics30d.json` | spend and conversions per ad: "Gimnasio Familiar" 31,366 MXN / 1,123, "Gimnasio con alberca" 4,076 / 441 |
| `google-vivo47-audience7d.json` | EKATAR (SEARCH) and the PMax: average frequency per user and unique users |
| `google-easyfit2026-adCatalog.json` | one RSA in "Search \| Octubre \| Easy Fit" |
| `google-easyfit2026-adMetrics30d.json` | that ad: 2,329.93 MXN / 3 |
| `google-easyfit2026-pmaxAssets30d.json` | "PMax \| Octubre \| Easy Fit \| Leads": 49 asset rows with cost and conversions per asset |
| `google-easyfit2026-audience7d.json` | the two Octubre campaigns (SEARCH, PERFORMANCE_MAX) |
| `google-easyfit2026-g7Campaigns.json` | the two ENABLED campaigns: name, channel, bidding status (`PAUSED` on 20 Oct), start, budget (350 / 320 MXN) |
| `google-easyfit2026-g7CampaignDaily14d.json` | spend and conversions per campaign per day, 6–19 Oct; nothing after 13 Oct |
| `google-tangassi-pmaxAssets30d.json` | asset group "TANGASSI" in "Necesidades SLP": 26 asset rows |

## SYNTHETIC

| File | Anchored to | Invented |
|---|---|---|
| `synthetic-attribution-formularios.json` | real Formularios ad set names and d7 leads | GA4 and sheet counts, coverage split |
| `synthetic-cross-move-faults.json` | real Formularios / TikTok / Google budgets | the injected errors (compensated, stranded) |
| `synthetic-currency-mismatch.json` | real Formularios currency MXN | the USD advertiser |
| `synthetic-google-easyfit-search-leads-7d.json` | real campaign 24274603133 + budget 700 | its 7-day metrics (the account spent 0) |
| `synthetic-google-demand-gen.json` | real Vivo 47 Display CPA 239.33 | the campaign and its per-day minimum |
| `synthetic-google-change-event-drift.json` | real EKATAR budget 1,179 | the human change to 1,300 |
