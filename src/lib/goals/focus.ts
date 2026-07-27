export type GoalFocus = { kind: 'request'; id: string } | { kind: 'artifact'; id: string };

export function parseGoalFocus(value: string | null | undefined): GoalFocus | null {
  if (!value) return null;
  const separator = value.indexOf(':');
  if (separator <= 0) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1).trim();
  if (!id || (kind !== 'request' && kind !== 'artifact')) return null;
  return { kind, id };
}
