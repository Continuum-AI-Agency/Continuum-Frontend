import { meta, instagram } from "@/lib/brand-icons";

type PlatformIconProps = {
  platform: string;
  className?: string;
};

export function PlatformIcon({ platform, className = "w-4 h-4" }: PlatformIconProps) {
  const p = platform.toLowerCase();

  let iconSvg: string | null = null;
  let title = "";

  if (p === "facebook" || p === "meta_page" || p === "page") {
    iconSvg = meta.svg;
    title = "Meta";
  } else if (p === "instagram" || p === "meta_instagram_user" || p === "instagram_user") {
    iconSvg = instagram.svg;
    title = "Instagram";
  }

  if (!iconSvg) return null;

  return (
    <span
      className={`inline-block shrink-0 [&>svg]:w-full [&>svg]:h-full [&>svg]:block ${className}`}
      title={title}
      dangerouslySetInnerHTML={{ __html: iconSvg }}
    />
  );
}
