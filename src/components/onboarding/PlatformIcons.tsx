"use client";

import React from "react";
import type { PlatformKey } from "./platforms";

type IconProps = {
  size?: number;
  className?: string;
};

function Svg({ children, size = 18, className }: React.PropsWithChildren<IconProps>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      focusable={false}
    >
      {children}
    </svg>
  );
}

function YouTubeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="6" width="20" height="12" rx="3" fill="#FF0033" />
      <polygon points="10,9 16,12 10,15" fill="#ffffff" />
    </Svg>
  );
}

function InstagramIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="#C13584" />
      <circle cx="12" cy="12" r="4" fill="#ffffff" />
      <circle cx="17.5" cy="6.5" r="1.5" fill="#ffffff" />
    </Svg>
  );
}

function FacebookIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#1877F2" />
      <path d="M13 8h2V6h-2c-2.2 0-3.5 1.2-3.5 3.2V12H8v2h1.5v4H12v-4h2l.5-2H12V9.6c0-.9.4-1.6 1-1.6Z" fill="#ffffff" />
    </Svg>
  );
}

function ThreadsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" fill="#000000" />
      <path d="M12 7c3 0 5 2 5 5s-2 5-5 5c-2 0-3.5-1-3.5-2.5S10 12 12.7 12.2c.9.1 1.8-.4 1.8-1.2 0-.8-.7-1.5-2.5-1.5-1.6 0-2.8.6-3.7 1.8l-1.5-1.2C8 8 9.8 7 12 7Z" fill="#ffffff" />
    </Svg>
  );
}

function TikTokIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#000000" />
      <path d="M14 7c.6 1.3 1.8 2.2 3.2 2.4V12c-1.6-.2-3-.9-4.2-1.9V14c0 2.2-1.8 4-4 4-2.1 0-3.8-1.6-4-3.6 0-2 1.6-3.7 3.6-3.8.5 0 1 .1 1.4.3v2a2 2 0 0 0-1.4-.5c-1 0-1.8.8-1.8 1.8S7.6 16 8.6 16s1.8-.8 1.8-1.8V6h2.6Z" fill="#ffffff" />
    </Svg>
  );
}

function LinkedInIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" fill="#0A66C2" />
      <rect x="6" y="10" width="3" height="8" fill="#ffffff" />
      <rect x="6" y="6" width="3" height="2.5" fill="#ffffff" />
      <path d="M11 10h2.3v1.1c.4-.7 1.1-1.3 2.4-1.3 2 0 3.3 1.3 3.3 3.5V18h-3v-3c0-1-.4-1.7-1.4-1.7-.9 0-1.4.6-1.4 1.7V18H11v-8Z" fill="#ffffff" />
    </Svg>
  );
}

function GoogleAdsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="16" r="4" fill="#34A853" />
      <rect x="11" y="4" width="4" height="14" rx="2" fill="#FBBC05" />
      <circle cx="16" cy="16" r="4" fill="#4285F4" />
    </Svg>
  );
}

function DV360Icon(props: IconProps) {
  return (
    <Svg {...props}>
      <polygon points="12,4 20,12 12,20 4,12" fill="#1ABC5B" />
      <polygon points="12,7 17,12 12,17 7,12" fill="#0EA85D" />
    </Svg>
  );
}

function AmazonAdsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#232F3E" />
      <path d="M9.2 9.3c.4-1.7 2-2.6 3.5-2.6 1.3 0 2.5.5 3.1 1.4l-1.5 1c-.3-.4-.9-.7-1.6-.7-1.2 0-2.2.8-2.2 2.2v5.2H8.4V6.9h1v2.4h-.2Z" fill="#ffffff" />
      <path d="M6 17c2.6 1.4 5.3 1.5 8.3.5" stroke="#FF9900" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#000000" />
      <path d="M8 16l8-8m-6 0 6 8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

import Image from "next/image";

export function PlatformIcon({ platform, size = 18, className }: IconProps & { platform: PlatformKey | "google" | "meta" }) {
  switch (platform) {
    case "google":
    case "googleAds":
    case "youtube":
    case "dv360":
      return (
        <Image 
          src={platform === "youtube" ? "/logos/youtube.svg" : "/logos/google.svg"} 
          alt={platform} 
          width={size} 
          height={size} 
          className={className}
        />
      );
    case "meta":
    case "facebook":
      return <Image src={platform === "facebook" ? "/logos/facebook-icon.svg" : "/logos/meta.svg"} alt="Meta" width={size} height={size} className={className} />;
    case "instagram":
      return <Image src="/logos/instagram-icon.svg" alt="Instagram" width={size} height={size} className={className} />;
    case "threads":
      return <Image src="/logos/threads.svg" alt="Threads" width={size} height={size} className={className} />;
    case "tiktok":
      return <Image src="/logos/tiktok-icon-light.svg" alt="TikTok" width={size} height={size} className={className} />;
    case "linkedin":
      return <LinkedInIcon size={size} className={className} />;
    case "amazonAds":
      return <AmazonAdsIcon size={size} className={className} />;
    default:
      return <Svg size={size} className={className}><circle cx="12" cy="12" r="8" fill="#64748B" /></Svg>;
  }
}

export function ExtraIcon({ id, size = 18, className }: IconProps & { id: "x" }) {
  if (id === "x") return <XIcon size={size} className={className} />;
  return null;
}


// ---- Document Source Icons ----
export type DocumentSource =
  | "upload"
  | "canva"
  | "figma"
  | "google-drive"
  | "sharepoint"
  | "notion"
  | "website";

function UploadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="8" width="16" height="10" rx="2" fill="#6366F1" />
      <path d="M12 6v8m0-8-3 3m3-3 3 3" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function GoogleDriveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <polygon points="8,4 12,11 6,20 2,12" fill="#0F9D58" />
      <polygon points="16,4 22,15 12,11 8,4" fill="#4285F4" />
      <polygon points="6,20 18,20 22,15 12,11" fill="#F4B400" />
    </Svg>
  );
}

function CanvaIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" fill="#00C4CC" />
      <path d="M8 14c.5 1.6 2 3 4 3 2.5 0 4-2 4-5 0-2.8-1.8-5-4.5-5-1.8 0-3.2 1-3.6 2.6" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function FigmaIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="7" r="3" fill="#F24E1E" />
      <circle cx="12" cy="12" r="3" fill="#A259FF" />
      <circle cx="12" cy="17" r="3" fill="#0ACF83" />
      <circle cx="7.5" cy="9.5" r="2.5" fill="#FF7262" />
      <circle cx="16.5" cy="9.5" r="2.5" fill="#1ABCFE" />
    </Svg>
  );
}

function SharePointIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="12" r="5" fill="#0364B8" />
      <circle cx="16" cy="12" r="5" fill="#28A8EA" opacity="0.85" />
      <path d="M9 10h4a2 2 0 1 1 0 4H9" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

function NotionIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" fill="#1F2937" />
      <rect x="5.8" y="5.8" width="12.4" height="12.4" rx="1.2" fill="#111827" stroke="#FFFFFF" strokeWidth="1" />
      <path d="M9 17V8h2.3l3.7 5.7V8H17v9h-2.2L11 11.9V17H9Z" fill="#FFFFFF" />
    </Svg>
  );
}

function WebsiteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" fill="#0EA5E9" />
      <path d="M3 12h18M12 3c3.5 3.6 3.5 14.4 0 18M12 3c-3.5 3.6-3.5 14.4 0 18" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function DocumentSourceIcon({ source, size = 18, className }: IconProps & { source: DocumentSource }) {
  switch (source) {
    case "upload":
      return <UploadIcon size={size} className={className} />;
    case "google-drive":
      return <GoogleDriveIcon size={size} className={className} />;
    case "canva":
      return <CanvaIcon size={size} className={className} />;
    case "figma":
      return <FigmaIcon size={size} className={className} />;
    case "sharepoint":
      return <SharePointIcon size={size} className={className} />;
    case "notion":
      return <NotionIcon size={size} className={className} />;
    case "website":
      return <WebsiteIcon size={size} className={className} />;
    default:
      return <Svg size={size} className={className}><circle cx="12" cy="12" r="8" fill="#64748B" /></Svg>;
  }
}


