import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { cn } from '@/lib/utils';

/** "CAMPAIGN_PAUSED" → "Campaign paused". */
export function humanizeStatus(status: string): string {
  const words = status.toLowerCase().replaceAll('_', ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Unknown';
}

export function EntityStatusPill({ status, className }: { status: string; className?: string }) {
  if (status === 'ACTIVE') {
    return (
      <Pill variant="success" className={className}>
        <PillIndicator variant="success" />
        Active
      </Pill>
    );
  }
  return (
    <Pill variant={status === 'DELETED' ? 'destructive' : 'muted'} className={className}>
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full',
          status === 'PAUSED' && 'bg-muted-foreground/70',
          status === 'DELETED' && 'bg-destructive/70',
          status !== 'PAUSED' && status !== 'DELETED' && 'bg-muted-foreground/30',
        )}
      />
      {humanizeStatus(status)}
    </Pill>
  );
}
