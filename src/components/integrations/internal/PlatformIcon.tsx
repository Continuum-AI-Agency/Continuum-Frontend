import Image from "next/image";

type PlatformIconProps = {
  platform: string;
  className?: string;
};

export function PlatformIcon({ platform, className = "w-4 h-4" }: PlatformIconProps) {
  const p = platform.toLowerCase();

  if (p === "facebook" || p === "meta_page" || p === "page") {
    return (
      <Image
        src="/logos/facebook-icon.svg"
        alt="Facebook"
        width={16}
        height={16}
        className={className}
      />
    );
  }

  if (p === "instagram" || p === "meta_instagram_user" || p === "instagram_user") {
    return (
      <Image
        src="/logos/instagram-icon.svg"
        alt="Instagram"
        width={16}
        height={16}
        className={className}
      />
    );
  }

  return null;
}
