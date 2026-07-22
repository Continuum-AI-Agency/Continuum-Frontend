import { cn } from '@/lib/utils';

type GenerationPulseLoaderProps = {
  className?: string;
};

export function GenerationPulseLoader({ className }: GenerationPulseLoaderProps) {
  return (
    <div className={cn('flex h-full w-full items-center justify-center', className)}>
      <div
        role="status"
        aria-live="polite"
        aria-label="Generating media"
        className="relative flex h-12 w-12 items-center justify-center"
      >
        <span className="absolute inline-flex h-12 w-12 rounded-full bg-brand-primary/20 animate-ping motion-reduce:animate-none" />
        <span className="absolute inline-flex h-10 w-10 rounded-full border border-brand-primary/60 animate-pulse motion-reduce:animate-none" />
        <span className="relative inline-flex h-4 w-4 rounded-full bg-brand-primary" />
      </div>
    </div>
  );
}
