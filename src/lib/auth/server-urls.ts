import "server-only";

import { headers } from "next/headers";
import { resolveHeadersOrigin } from "@/lib/server/origin";

const DEFAULT_LOCAL_ORIGIN = "http://localhost:3000";

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export async function resolveAppOrigin(): Promise<string> {
  const fallback =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? DEFAULT_LOCAL_ORIGIN;
  const headerStore = await headers();
  return resolveHeadersOrigin(headerStore, fallback);
}

export async function buildAbsoluteAppUrl(pathname: string): Promise<string> {
  const origin = await resolveAppOrigin();
  return new URL(normalizePathname(pathname), origin).toString();
}

