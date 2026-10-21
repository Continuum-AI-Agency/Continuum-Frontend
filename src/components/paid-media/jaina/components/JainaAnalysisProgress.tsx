import { type JainaUIMessage, jainaAnalysisProgressSchema } from '@continuum/contracts';

/** Progress is a typed run part, so reconnect/history uses the same visible notice as live. */
export function JainaAnalysisProgress({ message }: { message?: JainaUIMessage }) {
  const rows = new Map<string, ReturnType<typeof jainaAnalysisProgressSchema.parse>>();
  for (const part of message?.parts ?? []) {
    if (part.type !== 'data-jaina-analysis-progress') continue;
    const parsed = jainaAnalysisProgressSchema.safeParse(part.data);
    if (parsed.success) {
      const key = `${parsed.data.kind}:${parsed.data.id}`;
      rows.delete(key);
      rows.set(key, parsed.data);
    }
  }
  if (rows.size === 0) return null;
  const progress = [...rows.values()];
  // The long-answer notice opens; then every layer, hypothesis and drill with its state, in the
  // order each first reported (Phase 3, PRD §5.6: progress per layer, not only the latest line).
  const notices = progress.filter((row) => row.kind === 'notice');
  const steps = progress.filter((row) => row.kind !== 'notice');
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto my-2 w-full max-w-3xl text-sm text-muted-foreground"
      data-testid="jaina-analysis-progress"
    >
      {notices.map((row) => (
        <p key={`${row.kind}:${row.id}`} data-status={row.status}>
          <span>{row.label}</span>
          {row.detail ? <span> — {row.detail}</span> : null}
        </p>
      ))}
      {steps.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {steps.map((row) => (
            <li
              key={`${row.kind}:${row.id}`}
              data-status={row.status}
              className={row.status === 'running' ? 'text-foreground' : undefined}
            >
              <span>{row.label}</span>
              {row.detail ? <span> — {row.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
