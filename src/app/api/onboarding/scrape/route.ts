import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ScrapeResult } from "@/lib/onboarding/scrape";

export const runtime = "nodejs";

const SCRAPE_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 500_000;

const requestSchema = z.object({ url: z.string().min(3) });

export type { ScrapeResult } from "@/lib/onboarding/scrape";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { url?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  const target = normalizeUrl(parsed.data.url);
  if (!target) {
    return NextResponse.json({ error: "Could not parse url" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const response = await fetch(target.href, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 ContinuumOnboardingBot/1.0" },
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Site responded ${response.status}` }, { status: 502 });
    }
    const html = await readBoundedText(response, MAX_HTML_BYTES);
    const result = extract(target, html);
    return NextResponse.json(result satisfies ScrapeResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scrape failed";
    console.error(JSON.stringify({ scope: "onboarding.scrape", url: target.href, user_id: userData.user.id, error: message }));
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUrl(input: string): URL | null {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

async function readBoundedText(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let received = 0;
  while (received < limit) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    buffer += decoder.decode(value, { stream: true });
  }
  try {
    await reader.cancel();
  } catch {
    /* noop */
  }
  return buffer;
}

function extract(base: URL, html: string): ScrapeResult {
  const headSlice = html.slice(0, Math.min(html.length, 60_000));
  const title = matchOne(headSlice, /<title[^>]*>([^<]+)<\/title>/i);
  const description =
    metaContent(headSlice, "description") ?? metaContent(headSlice, "og:description") ?? null;
  const ogImage = metaContent(headSlice, "og:image");
  const iconHref = matchOne(
    headSlice,
    /<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*href=["']([^"']+)["']/i
  );
  const logoUrl = absolutize(base, ogImage ?? iconHref);
  return {
    url: base.href,
    title: cleanText(title),
    description: cleanText(description),
    logoUrl,
    colors: extractColors(html),
    typography: extractTypography(html),
  };
}

function matchOne(source: string, regex: RegExp): string | null {
  const m = source.match(regex);
  return m?.[1]?.trim() ?? null;
}

function metaContent(source: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ogPattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const reversePattern = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
    "i"
  );
  return matchOne(source, ogPattern) ?? matchOne(source, reversePattern);
}

function absolutize(base: URL, href: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function cleanText(value: string | null): string | null {
  if (!value) return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length === 0 ? null : collapsed.slice(0, 280);
}

function extractColors(html: string): string[] {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/#([0-9a-f]{6})\b/gi)) {
    const hex = `#${m[1].toUpperCase()}`;
    if (isUtilityColor(hex)) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hex]) => hex);
}

function isUtilityColor(hex: string): boolean {
  return /^#(FFFFFF|000000|FAFAFA|F5F5F5|EEEEEE|CCCCCC|888888|111111)$/.test(hex);
}

function extractTypography(html: string): { primary: string | null; secondary: string | null } {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/font-family\s*:\s*([^;"'}]+)/gi)) {
    const family = firstFamily(m[1]);
    if (!family) continue;
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([family]) => family);
  return { primary: sorted[0] ?? null, secondary: sorted[1] ?? null };
}

function firstFamily(value: string): string | null {
  const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "") ?? "";
  if (!first) return null;
  if (/^(inherit|initial|unset|revert|var\(|--)/i.test(first)) return null;
  if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+)$/i.test(first)) return null;
  return first.length > 60 ? null : first;
}
