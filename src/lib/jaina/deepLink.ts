// One way into Jaina with a question already written. Contextual entry points (an
// Optimizer row, a portfolio card, a saved dashboard's refresh) all build the same href,
// and the Jaina tab reads the `prompt` param on open.
//
// A question asked from one platform's view (the Optimizer's Google or TikTok tab) carries that
// platform as `platform`, so the turn is scoped to it. The param sits before `prompt`, which
// stays last: the prompt is the long, encoded part, and readers split on it.
//
// A prepared question (an Ask-Jaina chip) is a fresh ask, so it carries `new=1`: the Jaina tab
// opens a new conversation for it instead of appending it to the most recent one.

import { type PlatformId, PlatformIdSchema } from '@continuum/contracts';

export function jainaPromptHref(
  prompt: string,
  platform?: PlatformId | null,
  options: { newConversation?: boolean } = {},
): string {
  const scope = platform ? `&platform=${platform}` : '';
  const fresh = options.newConversation ? '&new=1' : '';
  return `/scale?tab=jaina${scope}${fresh}&prompt=${encodeURIComponent(prompt)}`;
}

/** `?new=1` on the Jaina tab: the deep link asks for a new conversation. */
export function jainaNewConversationParam(raw: string | null): boolean {
  return raw === '1';
}

/** `?platform=` on the Jaina tab as a platform id; anything unknown or absent is null. */
export function jainaPlatformParam(raw: string | null): PlatformId | null {
  const parsed = PlatformIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The conversation the Jaina tab opens on first load: a session the link names, else none when
 * the link asks for a new conversation (the fresh session the surface mounted with stands), else
 * the most recent one.
 */
export function jainaOpeningSessionId(input: {
  deepLinkSessionId: string | null;
  newConversation: boolean;
  latestSessionId: string | null | undefined;
}): string | null {
  if (input.deepLinkSessionId) return input.deepLinkSessionId;
  if (input.newConversation) return null;
  return input.latestSessionId ?? null;
}
