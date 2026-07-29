// Brand marks as icon components. lucide-react v1 removed every brand glyph
// (Facebook, Instagram, Linkedin, Twitter, Youtube, Figma) for trademark
// reasons, so `@/lib/brand-icons` is now the only source of brand artwork and
// this module is the only way to render it. One factory, one copy of each mark.

import {
  amazon,
  type BrandIconData,
  facebook,
  figma,
  google,
  instagram,
  linkedin,
  meta,
  threads,
  tiktok,
  x,
  youtube,
} from '@/lib/brand-icons';
import { cn } from '@/lib/utils';

export type IconComponent = React.ComponentType<{ className?: string }>;

export function makeSvgIcon(iconData: BrandIconData): IconComponent {
  function SvgIcon({ className }: { className?: string }) {
    return (
      <span
        className={cn(
          'h-4 w-4 inline-block shrink-0 [&>svg]:w-full [&>svg]:h-full [&>svg]:block',
          className,
        )}
        title={iconData.title}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted inline brand-icon SVG from local @/lib/brand-icons constants, never user input
        dangerouslySetInnerHTML={{ __html: iconData.svg }}
      />
    );
  }
  SvgIcon.displayName = `BrandIcon(${iconData.title})`;
  return SvgIcon;
}

export const AmazonIcon = makeSvgIcon(amazon);
export const FacebookIcon = makeSvgIcon(facebook);
export const FigmaIcon = makeSvgIcon(figma);
export const GoogleIcon = makeSvgIcon(google);
export const InstagramIcon = makeSvgIcon(instagram);
export const LinkedInIcon = makeSvgIcon(linkedin);
export const MetaIcon = makeSvgIcon(meta);
export const ThreadsIcon = makeSvgIcon(threads);
export const TikTokIcon = makeSvgIcon(tiktok);
export const XIcon = makeSvgIcon(x);
export const YouTubeIcon = makeSvgIcon(youtube);
