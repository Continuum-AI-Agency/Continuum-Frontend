import type { OrganicPlatformKey } from "@/lib/organic/platforms";

export const ORGANIC_CALENDAR_API = {
  generateCalendar: "/api/organic/generate-calendar",
} as const;

export const ORGANIC_BETA_LAUNCH_SCHEDULE: Record<
  "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat",
  OrganicPlatformKey
> = {
  Mon: "instagram",
  Tue: "linkedin",
  Wed: "instagram",
  Thu: "linkedin",
  Fri: "instagram",
  Sat: "linkedin",
};

export const ORGANIC_NEWSLETTER_DEFAULT = {
  dayLabel: "Sun",
  timeLabel: "10:00 AM",
  format: "Newsletter",
} as const;

export const ORGANIC_DEFAULT_PROMPT = {
  id: "organic-default",
  name: "Organic default",
  description: "Continuum organic planning prompt.",
  content: "Generate a week of organic social drafts for the connected platforms.",
  source: "default",
} as const;
