// Derive a safe brand name from a scraped page <title>. A naive `scrape.title`
// fallback let auth/SSO interstitials become real brand_profiles rows (e.g. a
// brand literally named "Sign in - Claude" when onboarding was pointed at an
// OAuth login page). We reject login/SSO-looking titles and over-long titles,
// falling back to the existing name, then the URL hostname.

const LOGIN_TITLE_PATTERN =
  /\b(sign[\s-]?in|sign[\s-]?on|log[\s-]?in|log[\s-]?on|sign[\s-]?up|register|create account|authenticate|authentication|authoriz|oauth|sso|single sign|continue with|welcome back|loading|redirecting|just a moment|access denied|forbidden|not found|error)\b/i;

const MAX_BRAND_NAME_LENGTH = 80;

export function isLikelyLoginTitle(title: string): boolean {
  return LOGIN_TITLE_PATTERN.test(title);
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
    return candidate.slice(0, MAX_BRAND_NAME_LENGTH).trim();
  }

  const fallback = input.fallbackName?.trim();
  if (fallback && fallback.length > 0) {
    return fallback.slice(0, MAX_BRAND_NAME_LENGTH).trim();
  }

  return hostnameFromUrl(input.url);
}
