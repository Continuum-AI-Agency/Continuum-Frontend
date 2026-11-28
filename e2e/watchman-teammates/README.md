The real paused setup boundary passed in r2 and the named real Chrome journey passed in r3; current pinned evidence and remaining gates are recorded in `plans/074-watchman-teammates/acceptance.md` at the monorepo root. This harness covers the scoped local journey below, not provider or general release acceptance. It needs an existing hydrated local Supabase with the Watchman, Goal, Library, conversation and Vault migrations, a local owner/admin brand with the required entitlement, a local Upstash-compatible Redis endpoint, and an existing authenticated Playwright storage-state file for that same human and brand. It never installs, migrates, activates a teammate or deletes its fixtures.

The canonical synthetic owner UUID is accepted by PostgreSQL but rejected by production RFC UUID validation. For app acceptance, use a real GoTrue-confirmed human with the separate guarded `supabase/baseline/watchman-app-fixtures.sql`; preserve canonical fixtures and old attempts. This supplement checks that exact human identity and grants `organic_agent` and `paid_media` through the existing `billing.brand_products` model. It creates no subscription, credits, provider credentials or external billing event. Tier 1 alone does not satisfy the product gate. Keep `BENCH_SESSION_CACHE_DIR` inside the private owned staging directory when minting local sessions; preserve its token files outside captured evidence.

The Backend harness mounts the actual Watchman routes over HTTP with real local clients and actual token verification. Its additional admission hook allows only the two explicit setup request IDs, reads and typed `open_work` interactions. Free-text chat, activation, approval decisions, publishing, paid changes and external delivery remain closed. The browser passes real local HTTP/WebSocket traffic unchanged and rejects other origins; no response is fulfilled or replaced by the test. Readiness must describe the missing worker/runtime truthfully. The interactive AI SDK provider hop and autonomous execution are unexercised.

Prepare a private, user-controlled environment file outside Git. All URLs must be HTTP loopback origins. Set:

```text
WATCHMAN_LOCAL_SETUP_BENCH=authorized-local-stack
WATCHMAN_LOCAL_BROWSER_BENCH=authorized-local-stack
WATCHMAN_BENCH_OWNER=<fixture owner>
WATCHMAN_SETUP_RUN_ID=<one UUID for both processes>
WATCHMAN_SETUP_BRAND_ID=<existing local brand UUID>
WATCHMAN_SETUP_BACKEND_PORT=4417
WATCHMAN_SETUP_HUMAN_JWT=<verified local human access token>
WATCHMAN_SETUP_INPUT_FILE=<absolute path to the Backend setup input JSON>
WATCHMAN_BROWSER_SETUP_INPUT_FILE=<absolute path to a second setup input JSON>
WATCHMAN_BROWSER_SETUP_REQUEST_ID=<request_id from the second input>
WATCHMAN_BROWSER_STORAGE_STATE=<absolute path to existing local Playwright auth state>
WATCHMAN_BROWSER_OUTPUT_ROOT=<existing absolute private owned real directory within the supervised stage>
SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<local anon key>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service key>
MCP_REDIS_URL=http://127.0.0.1:8079
MCP_REDIS_TOKEN=<local REST Redis token>
NEXT_PUBLIC_API_URL=http://127.0.0.1:4417
PLAYWRIGHT_BASE_URL=http://localhost:3117
NEXT_DIST_DIR=.next/watchman-teammates
NEXT_TSCONFIG_PATH=tsconfig.e2e.json
```

Leave `WATCHMAN_RUNTIME_URL` unset; a hosted runtime URL is rejected. Preserve any other local environment values required to import the existing Backend modules. Each input JSON uses `watchmanCreateInputSchema`: `request_id`, `kind`, `role`, `name`, `instructions`, `first_assignment`, `timezone` and `budget_usd_month`. Choose distinct request IDs, recognizable fixture names and a bounded first assignment. Both teammates remain paused. Reuse the same files and IDs for recovery; changing their input is a conflict.

Only after declaring owner, approved GCS prefix, staging, resource limits and deadline and confirming at least 50 GiB free, run these commands. Retain prior attempts and use the existing store/cache.

```bash
# From Continuum-Backend; terminal 1. --serve retains only this owned HTTP server.
bun --no-env-file --env-file=/absolute/local-watchman-bench.env scripts/watchman/setupBench.ts --check
bun --no-env-file --env-file=/absolute/local-watchman-bench.env scripts/watchman/setupBench.ts --serve

# From the monorepo root; terminal 2. Reuses existing Playwright configuration.
# The wrapper preflights and atomically reserves a fresh private output attempt.
bun --no-env-file --env-file=/absolute/local-watchman-bench.env scripts/watchman-browser-bench.ts
```

The Backend checks actual HTTP setup and same-ID recovery, bot Auth metadata, a real Vault-backed password sign-in, paused first-assignment Goal/node/harness identity, readiness, roster and persisted typed work cards. The browser checks its real authenticated API target, setup/recovery form, stable bot and Goal receipts, roster/work ownership, conversation persistence, bounded card DOM, a real card action and fresh-document restoration. It mocks no API route, model or response.

Receipts are small JSON lines on stdout under the declared owner/run prefix `gs://continuum-production-477821-creative-benchmarks/watchman-setup/<run-id>/`; there are no screenshots, video, traces or automatic uploads. Retain stdout through the approved evidence process before claiming acceptance. The wrapper declares a 2 MiB error-output reservation; this is not a filesystem quota. Error-context and control files may be generated despite captures being disabled. The external supervisor must monitor the fresh output directory, service logs and Next cache within its total staging budget and stop owned jobs at its limits. Each attempt uses a new exclusive output directory so Playwright cannot clear earlier attempts. The wrapper performs no deletion or upload. The existing Playwright web-server lifecycle remains responsible for its owned process. Stop terminal 1 with Ctrl-C when finished; application records, Vault credentials and original auth-state files remain intact.
