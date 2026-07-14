import type { OrganicSession } from '@/lib/organic/agent-sessions';

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu;

export function toShortSessionTitle(session: OrganicSession): string {
  const source = session.title?.trim() || session.lastMessagePreview?.trim() || '';
  const compact = source
    .replace(UUID_PATTERN, 'draft')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return 'New conversation';

  const sentence = compact.split(/(?<=[.!?])\s/u, 1)[0]?.replace(/[.!?]+$/u, '') ?? compact;
  const words = sentence.split(' ').slice(0, 8);
  const shortened = words.join(' ').slice(0, 64).trim();
  return shortened || 'New conversation';
}

export function presentSessionTitles(sessions: readonly OrganicSession[]): Map<string, string> {
  const counts = new Map<string, number>();
  const titles = new Map<string, string>();

  for (const session of sessions) {
    const title = toShortSessionTitle(session);
    const key = title.toLocaleLowerCase();
    const occurrence = (counts.get(key) ?? 0) + 1;
    counts.set(key, occurrence);
    titles.set(session.sessionId, occurrence === 1 ? title : `${title} (${occurrence})`);
  }

  return titles;
}
