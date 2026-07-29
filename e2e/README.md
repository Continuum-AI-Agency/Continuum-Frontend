# Continuum Frontend — Playwright E2E

End-to-end tests for the Next.js app, driven by Playwright against a real browser
(Chromium). Auth is exercised through real Supabase GoTrue sessions minted with
the service-role admin API.

## Layout

```
e2e/
├── README.md            ← you are here
├── smoke.spec.ts        ← unauthenticated shell check (needs only a dev server)
├── chat-shell.spec.ts   ← chat shell bench (`bun run chat:e2e:bench`) — see below
└── support/
    └── auth.ts          ← Supabase auth-mint → Playwright storageState helpers
```

- `playwright.config.ts` (project root) — `testDir: ./e2e`, single `chromium`
  project, `baseURL = PLAYWRIGHT_BASE_URL || http://localhost:3000`, and a
  `webServer` that runs `bun run dev` with `reuseExistingServer: true`.

## Run

```bash
cd Continuum-Frontend
bun run test:e2e                    # all specs
bun run test:e2e e2e/smoke.spec.ts  # one spec
```

`test:e2e` maps to `playwright test`. Playwright auto-starts the dev server via
`bun run dev` (reusing one already on :3000). To target a running deployment
instead, set `PLAYWRIGHT_BASE_URL` (the local dev server is then skipped if it is
already reachable).

## PREREQUISITES

1. **Chromium browser** — one-time download:
   ```bash
   cd Continuum-Frontend
   bunx playwright install chromium
   ```
   If your environment blocks the download, install it on a machine with network
   access; the binary is cached under `~/Library/Caches/ms-playwright` (macOS).

2. **A dev server** — auto-started by the config (`bun run dev`), or already
   running on :3000, or a remote target via `PLAYWRIGHT_BASE_URL`. The dev server
   loads `Continuum-Frontend/.env`, which must contain `NEXT_PUBLIC_SUPABASE_URL`
   and a publishable/anon key or Next boot fails.

3. **Supabase auth-mint env — required ONLY for specs that authenticate**
   (`support/auth.ts`; `smoke.spec.ts` does NOT need these):
   - `SUPABASE_SERVICE_ROLE_KEY` — service-role key (server-only secret; never
     commit). Used to create ephemeral users and mint sessions.
   - `NEXT_PUBLIC_SUPABASE_URL` — the project URL.
   - A publishable/anon key: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` or
     `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used by the anon `verifyOtp` call).

   Provide these in the shell that runs `bun run test:e2e`, or in
   `Continuum-Frontend/.env` (the dev server reads it; export them for the
   Playwright process too if you run specs against a remote target).

## Auth helpers (`support/auth.ts`)

The app stores its Supabase session in **cookies** (not localStorage) via
`@supabase/ssr`, under the cookie name `sb-auth` (chunked as `sb-auth`,
`sb-auth.0`, … when large). The helpers mint a real GoTrue session and return a
Playwright `storageState` whose cookies are encoded by `@supabase/ssr` itself, so
the running app — browser client, middleware, and RSC server client — all
recognize the session.

- `mintSession({ isAdmin })` — creates an **ephemeral** confirmed user on the
  `@continuum-e2e.test` domain, stamps `app_metadata.is_admin = isAdmin`, and
  returns its `storageState`. Use for admin-gate specs (admin vs non-admin) and
  no-brand onboarding-redirect specs. (Ephemeral users persist in the target
  project's auth table; clean them up out-of-band if needed.)
- `ownerSessionForPizzaTest()` — mints a session for the seeded Pizza Test brand
  owner (`duanecscott@gmail.com`) for brand-scoped flows. **That user must
  already exist** in the target Supabase project; it is not auto-created.
- `mintSessionForEmail(email)` — lower-level helper behind both of the above.

Usage in a spec:

```ts
import { test } from "@playwright/test";
import { mintSession } from "./support/auth";

test("admin sees the admin console", async ({ browser }) => {
  const storageState = await mintSession({ isAdmin: true });
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto("/admin");
  // ...assertions
  await context.close();
});
```

Or hoist it for a whole file / project via a fixture or `test.use({ storageState })`.

## Notes

- `smoke.spec.ts` is the baseline; later lanes add `admin-gate.spec.ts` and
  `onboarding.spec.ts` on this same harness and helpers.
- Never print raw tokens or the service-role key in test output.

## Admin search bench

`bun run admin:search:e2e:bench` drives the real `/admin` RSC search path while
delaying one real response to reproduce the stale-snapshot race. Set
`E2E_ADMIN_STORAGE_STATE_PATH` to a pre-approved, short-lived admin Playwright
storage-state file for the local Frontend origin. The bench intentionally does
not create users or mint sessions with service-role credentials.

## Chat shell bench (`chat:e2e:bench`)

End-to-end bench for the Organic agent chat shell: history paging, the checkpoint minimap, Marker
milestones, and composer attachments. It seeds real rows into the local Postgres, reads them back
through the real Backend, renders them in the real Frontend, and uploads a real image to real
Supabase Storage — nothing is mocked. It purges its own rows before and after each run.

```bash
bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
bun run dev:be                       # Backend on :4000 — the panel reads history from it

# Run against a PRODUCTION build, not `next dev`: the agent panel is a next/dynamic chunk and
# dev-mode on-demand compilation leaves it unmounted for the life of the test.
cd Continuum-Frontend
set -a; . ./.env.local; set +a          # so the bundle points at LOCAL Supabase, not prod
bun run build && bun run start          # serves :3000, which Playwright reuses
bun run chat:e2e:bench
```

**Un-exercised hop:** the bench does not run a live agent turn. It asserts the composer sends a
populated `images` array carrying a signed URL that actually resolves (200 + image bytes) — the link
that was broken. The model-side consumption of that image is covered by the Backend unit test
`App/organic/agent/__tests__/composerImages.spec.ts`.
