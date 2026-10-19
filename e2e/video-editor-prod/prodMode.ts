/**
 * The Frontend video-editor benches' production mode: `VIDEO_EDITOR_PROD=1` (or an allowed origin)
 * drives the deployed Frontend against the production Backend instead of a local Next dev server
 * and an in-process Backend. Both revisions are read before the run and again after it; only one
 * valid revision each, on exactly https://app.trycontinuum.ai, earns the
 * `verified production revision: <frontend rev>` note the scorecard's Live point binds to
 * (scripts/video-studio/scorecard.mjs grade()). Same semantics as the Backend benches'
 * _bench/prodRevision, whose reader this reuses; its verifier is not, because that note would name
 * the Backend revision and the grader takes the first one.
 */
import {
  PRODUCTION_ORIGIN,
  REVISION_STEP,
  servingRevision,
} from '../../../Continuum-Backend/scripts/_bench/prodRevision';

export const PRODUCTION_FRONTEND = 'https://app.trycontinuum.ai';
export const PRODUCTION_BACKEND = PRODUCTION_ORIGIN;
export const FRONTEND_REVISION_STEP =
  'e2e: the deployed Frontend served one revision before and after the run';
/** Where the bench user's session cookie may go; beta is for the pre-promotion smoke only. */
const ORIGINS = [PRODUCTION_FRONTEND, 'https://app.beta.trycontinuum.ai'];

export type Revisions = { frontend: string; backend: string };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type Grader = {
  check(step: string, ok: boolean, detail?: string): void;
  note(message: string): void;
};

/** The deployed Frontend origin `VIDEO_EDITOR_PROD` selects, or undefined for the local mode. */
export function productionOrigin(value = process.env.VIDEO_EDITOR_PROD): string | undefined {
  if (!value) return undefined;
  const origin = value === '1' ? PRODUCTION_FRONTEND : value.replace(/\/+$/, '');
  if (!ORIGINS.includes(origin))
    throw new Error(`VIDEO_EDITOR_PROD must be 1 or one of ${ORIGINS.join(', ')}; got "${value}"`);
  return origin;
}

/** The revisions the Frontend's /api/healthz and the production Backend's /healthz serve. */
export async function servingRevisions(origin: string, fetcher: Fetch = fetch): Promise<Revisions> {
  const [frontend, backend] = await Promise.all([
    servingRevision(`${origin}/api`, fetcher),
    servingRevision(PRODUCTION_BACKEND, fetcher),
  ]);
  return { frontend, backend };
}

/**
 * At the end of a run: each surface must serve its `before` revision again. A PASS or FAIL step
 * each; the note only when both held and `origin` is exactly the production Frontend.
 */
export async function verifyServingRevisions(
  rec: Grader,
  origin: string,
  before: Revisions,
  fetcher: Fetch = fetch,
): Promise<boolean> {
  const read = (base: string) =>
    servingRevision(base, fetcher).catch((error: unknown) => String(error));
  const [frontend, backend] = await Promise.all([read(`${origin}/api`), read(PRODUCTION_BACKEND)]);
  const frontendHeld = frontend === before.frontend && /^[0-9a-f]{7,40}$/.test(before.frontend);
  const backendHeld = backend === before.backend && /^[0-9a-f]{7,40}$/.test(before.backend);
  rec.check(FRONTEND_REVISION_STEP, frontendHeld, `${origin} ${before.frontend} → ${frontend}`);
  rec.check(REVISION_STEP, backendHeld, `${PRODUCTION_BACKEND} ${before.backend} → ${backend}`);
  const held = frontendHeld && backendHeld;
  if (held && origin === PRODUCTION_FRONTEND)
    rec.note(`verified production revision: ${before.frontend}`);
  return held;
}
