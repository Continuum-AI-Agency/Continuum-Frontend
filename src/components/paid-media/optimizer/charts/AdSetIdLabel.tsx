import { cn } from '@/lib/utils';

// The dense ad-set id label shared by ReallocationFlow and CpaConfidenceBar (it
// was copy-pasted in both). Truncates inside its fixed column; the title exposes
// the full id on hover for when it is clipped.
export function AdSetIdLabel({ id, className }: { id: string; className?: string }) {
  return (
    <code
      title={id}
      className={cn('w-40 shrink-0 truncate font-mono text-2xs text-muted-foreground', className)}
    >
      {id}
    </code>
  );
}
