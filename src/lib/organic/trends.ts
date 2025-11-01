import { type OrganicPlatformKey } from "@/lib/organic/platforms";

export type Trend = {
  id: string;
  title: string;
  summary: string;
  momentum: "rising" | "stable" | "cooling";
  platforms: OrganicPlatformKey[];
  tags: string[];
};

export const DEFAULT_TRENDS: Trend[] = [
  {
    id: "ugc-experiences",
    title: "UGC Unboxing Experiences",
    summary: "Short-form, first-person demos showing authentic reactions to new product drops.",
    momentum: "rising",
    platforms: ["instagram", "tiktok", "youtube"],
    tags: ["ugc", "product", "storytelling"],
  },
  {
    id: "behind-the-scenes",
    title: "Behind-the-Scenes Sprints",
    summary: "Day-in-the-life content featuring makers, founders, or operators to humanize the brand.",
    momentum: "rising",
    platforms: ["linkedin", "instagram"],
    tags: ["team", "culture", "authentic"],
  },
  {
    id: "micro-tutorials",
    title: "Micro Tutorials",
    summary: "Three-step educational clips that solve a focused customer pain point in under 60 seconds.",
    momentum: "stable",
    platforms: ["tiktok", "instagram", "youtube"],
    tags: ["education", "problem-solving"],
  },
  {
    id: "thought-leadership-quotes",
    title: "Thought Leadership Quote Cards",
    summary: "Carousel-ready quote snapshots that distill POVs from leadership or strategic partners.",
    momentum: "stable",
    platforms: ["linkedin", "instagram"],
    tags: ["authority", "b2b", "carousel"],
  },
  {
    id: "live-shopping-teasers",
    title: "Live Shopping Teasers",
    summary: "Countdown stories and short reels teasing upcoming live-shopping or drop events.",
    momentum: "rising",
    platforms: ["instagram", "facebook", "tiktok"],
    tags: ["commerce", "launch", "event"],
  },
  {
    id: "ask-me-anything",
    title: "Ask Me Anything Threads",
    summary: "LinkedIn Pulse and Instagram Q&A stickers aggregating audience questions for weekly responses.",
    momentum: "cooling",
    platforms: ["linkedin", "instagram"],
    tags: ["community", "engagement"],
  },
];

export function filterTrendsForPlatforms(trends: Trend[], platforms: OrganicPlatformKey[]) {
  if (platforms.length === 0) return trends;
  return trends.filter((trend) => trend.platforms.some((platform) => platforms.includes(platform)));
}
