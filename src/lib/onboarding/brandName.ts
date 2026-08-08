// Derive a safe brand name from a scraped page <title>. A naive `scrape.title`
// fallback let auth/SSO interstitials become real brand_profiles rows (e.g. a
// brand literally named "Sign in - Claude" when onboarding was pointed at an
// OAuth login page). We reject login/SSO-looking titles and over-long titles,
// falling back to the existing name, then the URL hostname.

const LOGIN_TITLE_PATTERN =
  /\b(sign[\s-]?in|sign[\s-]?on|log[\s-]?in|log[\s-]?on|sign[\s-]?up|register|create account|authenticate|authentication|authoriz|oauth|sso|single sign|continue with|welcome back|loading|redirecting|just a moment|access denied|forbidden|not found|error)\b/i;

const MAX_BRAND_NAME_LENGTH = 80;

// A site <title> is usually "<brand> <sep> <tagline>", but plenty of real ones
// invert it ("Home | Vivo47", "Makeup, Skincare, Fragrance … | Sephora"), so
// keeping the leading segment picks the wrong side about as often as the right
// one. Splitting on spaced separators and keeping the SHORTEST segment gets the
// brand token in both directions; generic page labels are dropped first so
// "Inicio | UTEC" resolves to "UTEC" rather than "Inicio". Only SPACED
// separators count, which is what keeps "Coca-Cola" and "T-Mobile" intact.
//
// ponytail: shortest-segment heuristic. It picks the wrong side on the minority
// of titles whose brand is not the shortest part ("Clínica Thea | Clínica
// Oculoplástica | Chile" -> "Chile"). Upgrade path is confirming the resolved
// name in the onboarding UI rather than a smarter split.
const TITLE_SEPARATOR = /\s+[|—–·]\s+|\s+-\s+/;

const GENERIC_PAGE_LABEL =
  /^(home\s*page|home|inicio|início|accueil|startseite|start|index|welcome|bienvenidos?|bienvenue)$/i;

export function isLikelyLoginTitle(title: string): boolean {
  return LOGIN_TITLE_PATTERN.test(title);
}

export function brandSegmentOfTitle(title: string): string {
  const segments = title
    .split(TITLE_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && !GENERIC_PAGE_LABEL.test(segment));
  if (segments.length === 0) return title.trim();

  let shortest = segments[0];
  for (const segment of segments) {
    if (segment.length < shortest.length) shortest = segment;
  }
  return shortest;
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname;
  } catch {
    return 'Untitled Brand';
  }
}

export function resolveSafeBrandName(input: {
  scrapeTitle?: string | null;
  fallbackName?: string | null;
  url: string;
}): string {
  const candidate = input.scrapeTitle?.trim();
  if (candidate && candidate.length > 0 && !isLikelyLoginTitle(candidate)) {
    return brandSegmentOfTitle(candidate).slice(0, MAX_BRAND_NAME_LENGTH).trim();
  }

  const fallback = input.fallbackName?.trim();
  if (fallback && fallback.length > 0) {
    return fallback.slice(0, MAX_BRAND_NAME_LENGTH).trim();
  }

  return hostnameFromUrl(input.url);
}
