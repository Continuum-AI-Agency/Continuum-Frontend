import Image from 'next/image';

type BrandAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

type BrandAvatarProps = {
  name: string;
  logoUrl: string | null | undefined;
  size?: BrandAvatarSize;
  className?: string;
};

const SIZE_CONFIG: Record<BrandAvatarSize, { box: string; text: string; pixels: number }> = {
  xs: { box: 'h-4 w-4', text: 'text-3xs', pixels: 16 },
  sm: { box: 'h-6 w-6', text: 'text-2xs', pixels: 24 },
  md: { box: 'h-8 w-8', text: 'text-xs', pixels: 32 },
  lg: { box: 'h-9 w-9', text: 'text-sm', pixels: 36 },
};

function deriveInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';

  const words = trimmed.split(/\s+/);
  if (words.length === 1) {
    return trimmed.slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function BrandAvatar({ name, logoUrl, size = 'md', className }: BrandAvatarProps) {
  const config = SIZE_CONFIG[size];
  const initials = deriveInitials(name);
  const boxClasses = [
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold uppercase text-muted-foreground',
    config.box,
    config.text,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={boxClasses} aria-hidden={logoUrl ? undefined : true}>
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={name ? `${name} logo` : ''}
          width={config.pixels}
          height={config.pixels}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        initials
      )}
    </span>
  );
}
