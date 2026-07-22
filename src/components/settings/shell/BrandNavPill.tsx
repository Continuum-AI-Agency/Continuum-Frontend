import { BrandAvatar } from '@/components/brand/BrandAvatar';

type BrandNavPillProps = {
  name: string;
  logoUrl: string | null;
};

export function BrandNavPill({ name, logoUrl }: BrandNavPillProps) {
  return (
    <span
      className="inline-flex max-w-[140px] items-center gap-1.5 rounded-full border border-border/60 bg-card/40 py-0.5 pl-0.5 pr-2 text-xs font-medium text-foreground/90"
      title={name}
    >
      <BrandAvatar name={name} logoUrl={logoUrl} size="xs" />
      <span className="truncate">{name}</span>
    </span>
  );
}
