import { cn } from '@/lib/utils';

// The dense ad-set label shared by ReallocationFlow and CpaConfidenceBar (it was
// copy-pasted in both). Truncates inside its fixed column. When a human ad-set
// name is known it reads in normal text with the raw id kept in the title for
// provenance; absent a name it falls back to the mono raw id (the debug-looking
// but honest default), still exposing the full value on hover for the clipped case.
export function AdSetIdLabel({
  id,
  name,
  className,
}: {
  id: string;
  name?: string;
  className?: string;
}) {
  if (name) {
    return (
      <span
        title={`${name} · ${id}`}
        className={cn('w-40 shrink-0 truncate text-2xs text-muted-foreground', className)}
      >
        {name}
      </span>
    );
  }
  return (
    <code
      title={id}
      className={cn('w-40 shrink-0 truncate font-mono text-2xs text-muted-foreground', className)}
    >
      {id}
    </code>
  );
}
