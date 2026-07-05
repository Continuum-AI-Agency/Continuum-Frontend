import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

// Supabase auth-mint helper for Playwright E2E.
//
// The Continuum app persists its Supabase session in COOKIES (not localStorage)
// via @supabase/ssr. `createBrowserClient` is configured with
// `cookieOptions.name = "sb-auth"` (see src/lib/supabase/{client,cookies}.ts),
// so the session is written under the cookie `sb-auth` as
// `base64-<base64url(JSON.stringify(session))>`, chunked at 3180 chars into
// `sb-auth`, `sb-auth.0`, `sb-auth.1`, ... when large.
//
// To produce a storageState the running app actually recognizes we let the two
// libraries that own the format do the work: @supabase/auth-js serializes the
// real GoTrue session, and @supabase/ssr encodes + chunks it exactly as the
// browser client would. We never hand-roll the JWT, the session shape, or the
// base64 chunking.
//
// Mint recipe (per repo memory "local-e2e-auth-token-minting"): service-role
// admin API -> generateLink({ type: "magiclink" }) -> anon verifyOtp({
// token_hash }). The issued JWT carries the user's `app_metadata`, so
// `mintSession({ isAdmin: true })` yields a session whose claims include
// `app_metadata.is_admin`, which is what the /admin route gate reads.

const SUPABASE_AUTH_COOKIE_NAME = "sb-auth";
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // matches @supabase/ssr DEFAULT_COOKIE_OPTIONS
const PIZZA_TEST_OWNER_EMAIL = "duanecscott@gmail.com";

type SameSite = "Strict" | "Lax" | "None";

interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: SameSite;
}

export interface PlaywrightStorageState {
  cookies: StorageStateCookie[];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
}

export interface MintSessionOptions {
  isAdmin: boolean;
}

class MemorySessionStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  read(key: string): string | null {
    return this.store.get(key) ?? null;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[e2e/auth] Missing required env var ${name}. See Continuum-Frontend/e2e/README.md PREREQUISITES.`,
    );
  }
  return value;
}

function resolveAnonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;
  if (!key) {
    throw new Error(
      "[e2e/auth] Missing a Supabase publishable/anon key. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY. See e2e/README.md.",
    );
  }
  return key;
}

function resolveCookieDomain(): string {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
  return new URL(baseUrl).hostname;
}

function createAdminClient(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Reuses @supabase/ssr's own encoder + chunker so the emitted cookies are
// byte-identical to what the app's createBrowserClient writes at runtime.
function buildStorageState(rawSessionJson: string): PlaywrightStorageState {
  const encoded = `base64-${stringToBase64URL(rawSessionJson)}`;
  const chunks = createChunks(SUPABASE_AUTH_COOKIE_NAME, encoded);
  const domain = resolveCookieDomain();
  const expires = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS;

  const cookies: StorageStateCookie[] = chunks.map((chunk) => ({
    name: chunk.name,
    value: chunk.value,
    domain,
    path: "/",
    expires,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  }));

  return { cookies, origins: [] };
}

// Drives a real GoTrue session for `email` and captures the exact serialized
// session string the browser client would persist, then encodes it as cookies.
export async function mintSessionForEmail(email: string): Promise<PlaywrightStorageState> {
  const admin = createAdminClient();
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = resolveAnonKey();

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) {
    throw new Error(`[e2e/auth] generateLink failed for ${email}: ${linkError.message}`);
  }
  const hashedToken = linkData.properties?.hashed_token;
  if (!hashedToken) {
    throw new Error(`[e2e/auth] generateLink returned no hashed_token for ${email}.`);
  }

  const sessionStorage = new MemorySessionStorage();
  const anon = createClient(url, anonKey, {
    auth: {
      storageKey: SUPABASE_AUTH_COOKIE_NAME,
      storage: sessionStorage,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });
  if (verifyError) {
    throw new Error(`[e2e/auth] verifyOtp failed for ${email}: ${verifyError.message}`);
  }

  const persisted = sessionStorage.read(SUPABASE_AUTH_COOKIE_NAME);
  const rawSessionJson = persisted ?? (verifyData.session ? JSON.stringify(verifyData.session) : null);
  if (!rawSessionJson) {
    throw new Error(`[e2e/auth] No session was persisted after verifyOtp for ${email}.`);
  }

  return buildStorageState(rawSessionJson);
}

// Creates an ephemeral confirmed user (test-only domain) with the requested
// admin flag stamped into app_metadata, then mints its session. Use for
// admin-gate specs (admin vs non-admin) and no-brand onboarding-redirect specs.
export async function mintSession({ isAdmin }: MintSessionOptions): Promise<PlaywrightStorageState> {
  const admin = createAdminClient();
  const email = `e2e-${isAdmin ? "admin" : "user"}-${crypto.randomUUID()}@continuum-e2e.test`;

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { is_admin: isAdmin },
  });
  if (createError) {
    throw new Error(`[e2e/auth] createUser failed for ${email}: ${createError.message}`);
  }

  return mintSessionForEmail(email);
}

// Authenticates as the seeded Pizza Test brand owner (duanecscott@gmail.com) for
// brand-scoped flows. Requires that user to exist in the target Supabase project;
// it is NOT auto-created here.
export async function ownerSessionForPizzaTest(): Promise<PlaywrightStorageState> {
  return mintSessionForEmail(PIZZA_TEST_OWNER_EMAIL);
}
