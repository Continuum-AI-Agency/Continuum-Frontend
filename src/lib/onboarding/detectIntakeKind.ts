import { onboardingSocialInputSchema } from '@continuum/contracts';
import { resolveWebsiteDraftUrl } from './websiteDraft';

export type DetectedIntake =
  | { kind: 'website'; url: string }
  | { kind: 'instagram' | 'facebook'; url: string }
  /** An Instagram or Facebook link that is not a profile or business Page (a post, a group). */
  | { kind: 'unsupported_social' }
  | { kind: 'description' };

const SOCIAL_HOST = /^(?:www\.|m\.)?(?:instagram|facebook)\.com$/i;

/**
 * What one free-form onboarding input most likely is: a website, a social profile, or a
 * description of the business. Anything with whitespace is prose; empty input is null.
 */
export function detectIntakeKind(text: string): DetectedIntake | null {
  const value = text.trim();
  if (!value) return null;
  if (/\s/.test(value)) return { kind: 'description' };

  const social = onboardingSocialInputSchema.safeParse(value);
  if (social.success) return social.data;

  const url = resolveWebsiteDraftUrl(value);
  if (!url) return { kind: 'description' };
  const parsed = new URL(url);
  if (SOCIAL_HOST.test(parsed.hostname)) return { kind: 'unsupported_social' };
  // A bare word ("acme") parses as a URL; a site needs a dotted host with a real TLD.
  if (parsed.username || !/\.[a-z]{2,}$/i.test(parsed.hostname)) return { kind: 'description' };
  return { kind: 'website', url };
}
