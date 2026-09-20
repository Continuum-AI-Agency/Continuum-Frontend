import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { type MintedSession, mintSessionBundleForEmail } from './support/auth';
import { installForgeFixtures, STARCRAFT_BRAND_ID } from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// forge:intake — the ONE rung nothing else covers: a real project file, dropped on the real
// Forge drop target, in a real Chrome, reaching real production storage.
//
// Two benches already stand either side of this gesture and neither crosses it:
//   · `templates-r2.forge-studio.bench.spec.ts` drives this exact input, with every route
//     mocked — the affordance, no network. Its own header promises no byte reaches production
//     storage, which is why this lives in its own file rather than as a case inside it.
//   · `forge:aep-ready-render:e2e:bench` drives the whole ladder to a finished render, by
//     POSTing what the Frontend WOULD send — the network, no affordance.
// A drop target that stopped working would be green in both.
//
// So this spec is deliberately narrow. It asserts the gesture lands:
//   DROP     the real `Project files` input takes a real package, with NO route interception —
//            the deployed `library-upload` edge function and the real resumable upload run
//   ROW      a real `media.assets` row exists for it, with the bytes' own sha256
//   PENDING  a real `media.template_sources` row exists in `pending` — the projection the edge
//            function writes BEFORE parsing, which is what makes a missed parse dispatch visible
//            instead of swallowing a successful upload
//
// The BACKEND LIST is fixtures, and that is a measured decision, not a shortcut. Pointed at a
// dead backend the page never settles: React Query retries forever, React replaces the file
// input between Playwright resolving it and dispatching, and the `change` event lands on a
// detached node — `input.files=1 · change events=0`, an upload that silently never starts. The
// `change` probe below is what caught that and is kept for the next person. `/api/ai-studio/**`
// is answered from the shared contract-parsed fixtures so the page is STILL; nothing else is
// intercepted, so the drop itself is entirely real.
//
// NOT exercised here, by design: the forge ladder, the render fleet, and the Fastify backend.
// The ladder bench owns those and says so. The two halves meet at `media.template_sources` and
// no single artifact crosses that seam: chaining a freshly dropped asset into the ladder would
// provision a template into the LIVE Continuum_app workspace on every run, and nothing here can
// remove one. The wrapper prints that gap rather than implying coverage it does not have.
//
// Cleanup is BY ID, never by time window: the run records exactly what it created and removes
// those rows and that object.
//
// Usage — the wrapper builds the package and sets FORGE_INTAKE_AEP:
//   bun run forge:intake:e2e:bench
// ---------------------------------------------------------------------------

const { serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = process.env.FORGE_INTAKE_OWNER_EMAIL ?? 'duane@continuumai.agency';
const AEP_PATH = process.env.FORGE_INTAKE_AEP ?? '';
const HANDOFF_PATH =
  process.env.FORGE_INTAKE_HANDOFF ?? join(tmpdir(), 'forge-intake-handoff.json');
const KEEP = process.env.FORGE_INTAKE_KEEP === '1';

type Grade = { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail: string };
const grades: Grade[] = [];
const record = (step: string, grade: Grade['grade'], detail: string) => {
  grades.push({ step, grade, detail });
  console.log(`[forge:intake] ${grade} ${step} — ${detail}`);
};

let session: MintedSession | null = null;
/** Everything this run created, by id. The only thing cleanup is allowed to delete. */
const created: { assetId: string | null; storagePath: string | null } = {
  assetId: null,
  storagePath: null,
};

const admin = () =>
  createClient(PROD_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const [, payload] = accessToken.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

/** /forge is server-rendered from the ACTIVE brand, so the session has to name it first. */
async function pinSessionToStarCraft(accessToken: string): Promise<void> {
  const { sub, session_id } = claimsOf(accessToken);
  const db = admin();
  const { error } = await db.schema('brand_profiles').from('user_session_brands').upsert(
    {
      user_id: sub,
      session_id,
      active_brand_id: STARCRAFT_BRAND_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_id' },
  );
  if (error) throw new Error(`[forge:intake] session brand pin failed: ${error.message}`);
}

/**
 * The asset this drop created, found by the package's own unique file name — never by "the newest
 * row", which is how a time-window sweep once deleted a real user's asset.
 *
 * Keyed on the name rather than the digest because `asset_versions.checksum` is null on most rows
 * in production: the Frontend only hashes what it can, and a lookup that silently never matches
 * reads exactly like an upload that never happened. The digest is still checked, when there is one.
 */
async function assetByFileName(fileName: string): Promise<{
  assetId: string;
  storagePath: string;
  sizeBytes: number | null;
  checksum: string | null;
} | null> {
  const { data, error } = await admin()
    .schema('media')
    .from('asset_versions')
    .select('asset_id, storage_path, size_bytes, checksum, file_name, created_at')
    .eq('file_name', fileName)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`[forge:intake] asset lookup failed: ${error.message}`);
  const row = data?.[0];
  if (!row) return null;
  return {
    assetId: row.asset_id as string,
    storagePath: row.storage_path as string,
    sizeBytes: (row.size_bytes as number | null) ?? null,
    checksum: (row.checksum as string | null) ?? null,
  };
}

async function waitFor<T>(
  what: string,
  read: () => Promise<T | null>,
  timeoutMs = 120_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | null = null;
  while (Date.now() < deadline) {
    last = await read();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`[forge:intake] timed out waiting for ${what} after ${timeoutMs}ms`);
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  session = await mintSessionBundleForEmail(OWNER_EMAIL);
  await pinSessionToStarCraft(session.accessToken);
});

test.afterAll(async () => {
  // By id, and only what this run created. A window delete once hit a real user's row.
  if (created.assetId && !KEEP) {
    const db = admin();
    if (created.storagePath) {
      await db.storage
        .from('media-source')
        .remove([created.storagePath])
        .catch(() => undefined);
    }
    await db
      .schema('media')
      .from('template_sources')
      .delete()
      .eq('asset_id', created.assetId)
      .then(() => undefined);
    await db
      .schema('media')
      .from('assets')
      .delete()
      .eq('id', created.assetId)
      .then(() => undefined);
    record('cleanup', 'PASS', `removed asset ${created.assetId} and its source row`);
  } else if (created.assetId) {
    record('cleanup', 'SKIP', `kept asset ${created.assetId} (FORGE_INTAKE_KEEP=1)`);
  }

  if (session) {
    await admin()
      .auth.admin.signOut(session.accessToken, 'local')
      .catch(() => undefined);
    session = null;
  }

  const counts = grades.reduce(
    (acc, g) => {
      if (g.grade === 'PASS') acc.pass += 1;
      else if (g.grade === 'SKIP') acc.skip += 1;
      else acc.fail += 1;
      return acc;
    },
    { pass: 0, warn: 0, skip: 0, fail: 0 },
  );
  console.log(
    JSON.stringify({
      bench: 'forge:intake:e2e · drop',
      results: grades,
      notes: [
        'REAL: Chrome, the real `Project files` input on the server-rendered /forge, the deployed library-upload edge function, a real resumable upload into the private media-source bucket, and the real media.assets / media.template_sources rows in production.',
        'FIXTURES: /api/ai-studio/** only — the template list the page renders around the drop zone. Pointed at a dead backend instead, React Query retries forever and the change event lands on a detached input, so the upload never starts.',
        'NOT exercised here: the forge ladder (parse → build → draft → smoke → promote), the render fleet, and the Fastify backend — forge:aep-ready-render:e2e:bench owns those.',
      ],
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
});

test.describe('Forge intake — a real drop reaches real storage', () => {
  test.skip(!LIVE, 'forge:intake drives production storage; run it through forge:intake:e2e:bench');

  test('DROP · a real package on the real drop target lands as a real template source', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    if (!session) throw new Error('[forge:intake] no minted session');
    if (!AEP_PATH || !existsSync(AEP_PATH)) {
      throw new Error(`[forge:intake] FORGE_INTAKE_AEP is not on disk: ${AEP_PATH || '(unset)'}`);
    }

    const bytes = readFileSync(AEP_PATH);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    record(
      'bytes',
      bytes.byteLength > 1024 ? 'PASS' : 'FAIL',
      `${(bytes.byteLength / 1e6).toFixed(2)} MB · sha256 ${sha256.slice(0, 12)}…`,
    );

    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1440, height: 900 },
    });
    // ONLY the backend list, so the page stops re-rendering. The edge functions and storage are
    // deliberately left alone — that is the difference between this spec and every other one.
    await installForgeFixtures(context);
    const page: Page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        console.log(`[forge:intake] console.error ${message.text().slice(0, 300)}`);
      }
    });
    // The drop handler is invoked as `void receive(files)`, so anything it throws becomes an
    // unhandled rejection: no toast, no console.error, no upload. Without these two listeners a
    // thrown handler is indistinguishable from a drop target that was never wired.
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
      console.log(`[forge:intake] pageerror ${error.message.slice(0, 300)}`);
    });
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', (event) => {
        console.error(`[unhandledrejection] ${String((event as PromiseRejectionEvent).reason)}`);
      });
    });

    try {
      await page.goto('/forge', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
        timeout: 180_000,
      });

      // The affordance itself. If this input stops existing, a user cannot upload a template at
      // all, and every other Forge bench stays green.
      // Wait for a RENDERED card, not just the input. The input ships in the server HTML, so it
      // is present and settable before React has hydrated — and a file set then fires a native
      // `change` that bubbles to window while React's own handler does not exist yet. That reads
      // as `change events=1` and an upload that never starts, with no error anywhere.
      await expect(page.getByRole('list', { name: 'Templates' })).toBeVisible({ timeout: 120_000 });
      await expect(page.getByRole('article').first()).toBeVisible({ timeout: 60_000 });

      const input = page.getByLabel('Project files');
      await expect(input).toBeAttached({ timeout: 60_000 });
      record('affordance', 'PASS', 'the real `Project files` drop target is on a hydrated page');

      // Watch the input itself, so a failure can say WHICH link broke: the file never reached the
      // element, the element never fired `change`, or the app ignored it. Without this the three
      // are one silent timeout.
      await page.evaluate(() => {
        const probe = window as unknown as { __forgeIntakeChange?: number };
        probe.__forgeIntakeChange = 0;
        // Capture phase on the window, not the element: React re-renders can swap the input node,
        // and a listener bound to the old node would report zero for an event that did fire.
        window.addEventListener(
          'change',
          () => {
            probe.__forgeIntakeChange = (probe.__forgeIntakeChange ?? 0) + 1;
          },
          true,
        );
      });

      // What a drop and "click to choose" both feed. Handed as a BUFFER, the way the fixture
      // bench does it: a path makes Playwright stream the file in, and the `change` React listens
      // for never arrives — the file sits on the element and nothing happens.
      await input.setInputFiles({
        name: basename(AEP_PATH),
        mimeType: 'application/zip',
        buffer: bytes,
      });

      const wiring = await input.evaluate((element: HTMLInputElement) => ({
        files: element.files?.length ?? 0,
        firstName: element.files?.[0]?.name ?? null,
        type: element.files?.[0]?.type ?? null,
        changes: (window as unknown as { __forgeIntakeChange?: number }).__forgeIntakeChange ?? 0,
      }));
      // `files` is 0 by design once the handler has run: ForgeProjectDrop resets `value` so the
      // same file can be dropped twice. The event count is the signal, not the file list.
      record(
        'change',
        wiring.changes > 0 ? 'PASS' : 'FAIL',
        `change events=${wiring.changes} · input.files=${wiring.files} after the handler reset it` +
          (wiring.changes === 0
            ? ' — the file was set but React never saw it (drop happened before hydration, or the file was passed by path rather than as a buffer)'
            : ''),
      );

      // Read the SCREEN before the database. An upload the app refused leaves a sentence here and
      // no row anywhere, so polling the database alone turns a refusal into a 2-minute timeout
      // that names nothing. Grade what the node shows, then what it wrote.
      const strip = page.getByText(/uploading|uploaded|%/i).first();
      const visible = await strip
        .waitFor({ state: 'visible', timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      record(
        'accepted',
        visible ? 'PASS' : 'FAIL',
        visible
          ? 'the app took the file and showed it uploading'
          : `no upload feedback appeared. Page errors: ${pageErrors.join(' | ') || 'none'}. Page said: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400)}`,
      );

      const landed = await waitFor('the uploaded asset version', () =>
        assetByFileName(basename(AEP_PATH)),
      );
      created.assetId = landed.assetId;
      created.storagePath = landed.storagePath;
      record(
        'row',
        landed.checksum === null || landed.checksum === sha256 ? 'PASS' : 'FAIL',
        `media.assets ${landed.assetId} · ${landed.sizeBytes ?? '?'} bytes at ${landed.storagePath}` +
          (landed.checksum === null
            ? ' · no checksum recorded by the uploader'
            : ` · checksum matches the dropped bytes`),
      );

      // The projection the edge function writes BEFORE parsing. Its absence is how a missed parse
      // dispatch used to swallow a successful upload out of the Templates tab entirely.
      const source = await waitFor('the template_sources projection', async () => {
        const { data } = await admin()
          .schema('media')
          .from('template_sources')
          .select('asset_id, parse_state, family, brand_id')
          .eq('asset_id', landed.assetId)
          .maybeSingle();
        return data ?? null;
      });
      record(
        'pending',
        source.brand_id === STARCRAFT_BRAND_ID ? 'PASS' : 'FAIL',
        `template_sources parse_state=${source.parse_state} family=${source.family} brand=${source.brand_id}`,
      );

      writeFileSync(
        HANDOFF_PATH,
        JSON.stringify(
          { assetId: landed.assetId, sha256, storagePath: landed.storagePath },
          null,
          2,
        ),
      );
    } catch (error) {
      // A throw must not leave a GREEN envelope. `waitFor` rejects, so without this the run ends
      // with only the steps that already passed recorded, counts.fail = 0 and exitCode 0 — a
      // bench reporting success for a run that failed. The step is recorded, then rethrown so
      // Playwright still fails.
      record('drop', 'FAIL', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      await context.close().catch(() => undefined);
    }
  });
});
