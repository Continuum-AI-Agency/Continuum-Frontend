// One way into Jaina with a question already written. Contextual entry points (an
// Optimizer row, a portfolio card, a saved dashboard's refresh) all build the same href,
// and the Jaina tab reads the `prompt` param on open.
//
// A question asked from one platform's view (the Optimizer's Google or TikTok tab) carries that
// platform as `platform`, so the turn is scoped to it. The param sits before `prompt`, which
// stays last: the prompt is the long, encoded part, and readers split on it.

import { type PlatformId, PlatformIdSchema } from '@continuum/contracts';

export function jainaPromptHref(prompt: string, platform?: PlatformId | null): string {
  const scope = platform ? `&platform=${platform}` : '';
  return `/scale?tab=jaina${scope}&prompt=${encodeURIComponent(prompt)}`;
}

/** `?platform=` on the Jaina tab as a platform id; anything unknown or absent is null. */
export function jainaPlatformParam(raw: string | null): PlatformId | null {
  const parsed = PlatformIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
