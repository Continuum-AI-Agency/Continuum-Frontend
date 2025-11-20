import type { CookieOptions, CookieOptionsWithName } from "@supabase/ssr";

const isProduction = process.env.NODE_ENV === "production";

export const SUPABASE_COOKIE_NAME = "sb-auth";

const BASE_SUPABASE_COOKIE_OPTIONS: CookieOptionsWithName = {
  name: SUPABASE_COOKIE_NAME,
  path: "/",
  sameSite: "lax",
  secure: isProduction,
};

export const SUPABASE_COOKIE_OPTIONS: CookieOptionsWithName = BASE_SUPABASE_COOKIE_OPTIONS;

export function getSupabaseCookieOptions(): CookieOptionsWithName {
  return { ...BASE_SUPABASE_COOKIE_OPTIONS };
}

export type SupabaseCookieRecord = {
  name: string;
  value: string;
  options?: CookieOptions;
};

const SUPABASE_COOKIE_ROOTS = new Set<string>([
  "sb",
  SUPABASE_COOKIE_NAME,
  "sb-access-token",
  "sb-refresh-token",
  "sb-auth-token",
  "supabase-auth-token",
  "supabase-refresh-token",
  "supabase-session",
]);

function getSupabaseCookieRoot(name: string) {
  return name.split(".")[0];
}

function isSupabaseAuthCookie(name: string) {
  const root = getSupabaseCookieRoot(name);

  return (
    SUPABASE_COOKIE_ROOTS.has(root) ||
    root.startsWith("sb-") ||
    root.startsWith("supabase-")
  );
}

function normalizeCookieOptions(options?: CookieOptions): CookieOptions | undefined {
  if (!options) {
    return undefined;
  }

  const normalized: CookieOptions = {};

  if (options.domain !== undefined) {
    normalized.domain = options.domain;
  }

  if (options.path !== undefined) {
    normalized.path = options.path;
  }

  if (options.maxAge !== undefined) {
    normalized.maxAge = options.maxAge;
  }

  if (options.httpOnly !== undefined) {
    normalized.httpOnly = options.httpOnly;
  }

  if (options.secure !== undefined) {
    normalized.secure = options.secure;
  }

  if (options.sameSite !== undefined) {
    normalized.sameSite = options.sameSite;
  }

  if (options.expires !== undefined) {
    normalized.expires = options.expires;
  }

  const priority = (options as { priority?: "low" | "medium" | "high" }).priority;

  if (priority !== undefined) {
    normalized.priority = priority;
  }

  return normalized;
}

function buildRemovalOptions(options?: CookieOptions): CookieOptions {
  const normalized = normalizeCookieOptions(options) ?? {};

  return {
    ...normalized,
    path: normalized.path ?? "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

function dedupeCookies(cookies: SupabaseCookieRecord[]) {
  const map = new Map<string, SupabaseCookieRecord>();

  cookies.forEach((cookie) => {
    map.set(cookie.name, {
      name: cookie.name,
      value: cookie.value,
      options: normalizeCookieOptions(cookie.options),
    });
  });

  return Array.from(map.values());
}

export async function applySupabaseCookies(
  cookiesToSet: SupabaseCookieRecord[],
  handlers: {
    getExisting: () => { name: string; value: string }[] | null | undefined;
    set: (name: string, value: string, options?: CookieOptions) => void | Promise<void>;
    remove: (name: string, options: CookieOptions) => void | Promise<void>;
  },
) {
  if (cookiesToSet.length === 0) {
    return;
  }

  const deduped = dedupeCookies(cookiesToSet);
  const existing = handlers.getExisting() ?? [];
  const incomingSupabaseNames = new Set(
    deduped
      .filter(({ name }) => isSupabaseAuthCookie(name))
      .map(({ name }) => name),
  );

  for (const { name } of existing) {
    if (!isSupabaseAuthCookie(name)) {
      continue;
    }

    if (!incomingSupabaseNames.has(name)) {
      await handlers.remove(name, buildRemovalOptions());
    }
  }

  for (const cookie of deduped) {
    if (!cookie.value) {
      await handlers.remove(cookie.name, buildRemovalOptions(cookie.options));
      continue;
    }

    await handlers.set(cookie.name, cookie.value, cookie.options);
  }
}

let hasRunDevSelfCheck = false;

async function runDevelopmentSelfCheck() {
  if (hasRunDevSelfCheck || isProduction) {
    return;
  }

  hasRunDevSelfCheck = true;

  const store = new Map<string, { value: string; options?: CookieOptions }>([
    ["sb-access-token", { value: "legacy" }],
    ["sb-access-token.0", { value: "legacy-chunk" }],
    ["custom-cookie", { value: "retain" }],
  ]);

  const handlers = {
    getExisting: () =>
      Array.from(store.entries()).map(([name, { value }]) => ({ name, value })),
    set: (name: string, value: string, options?: CookieOptions) => {
      store.set(name, { value, options });
    },
    remove: (name: string) => {
      store.delete(name);
    },
  } as const;

  try {
    await applySupabaseCookies(
      [
        { name: SUPABASE_COOKIE_NAME, value: "next", options: { path: "/" } },
        { name: "sb-access-token", value: "", options: { path: "/" } },
      ],
      handlers,
    );

    const supabaseKeys = Array.from(store.keys()).filter((key) => isSupabaseAuthCookie(key));

    if (!(supabaseKeys.length === 1 && supabaseKeys[0] === SUPABASE_COOKIE_NAME)) {
      console.warn(
        "[supabase cookies] Development self-check detected unexpected Supabase cookie dedupe results:",
        supabaseKeys,
      );
    }
  } catch (error) {
    console.warn("[supabase cookies] Development self-check failed:", error);
  }
}

if (!isProduction) {
  void runDevelopmentSelfCheck();
}
