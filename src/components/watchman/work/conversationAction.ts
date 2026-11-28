import { type WatchmanUiAction, watchmanUiActionSchema } from '@continuum/contracts';

/** Older conversation records store button gestures as JSON; display them as actions. */
export function conversationAction(
  text: string,
): Exclude<WatchmanUiAction, { type: 'reply' }> | null {
  if (!text.startsWith('{') || text.length > 20_000) return null;
  try {
    const action = watchmanUiActionSchema.safeParse(JSON.parse(text));
    return action.success && action.data.type !== 'reply' ? action.data : null;
  } catch {
    return null;
  }
}
