import type {
  BrandInsightsQuestion,
  BrandInsightsQuestionsByNiche,
} from "@/lib/schemas/brandInsights";

type QuestionsByNiche = BrandInsightsQuestionsByNiche["questionsByNiche"];

type SupportedPlatformConfig = {
  label: string;
  tokens: readonly string[];
};

type SupportedPlatforms = {
  youtube: SupportedPlatformConfig;
  x: SupportedPlatformConfig;
  linkedin: SupportedPlatformConfig;
};

export const SUPPORTED_PLATFORMS: SupportedPlatforms = {
  youtube: {
    label: "YouTube",
    tokens: ["youtube", "yt"],
  },
  x: {
    label: "X/Twitter",
    tokens: ["twitter", "x"],
  },
  linkedin: {
    label: "LinkedIn",
    tokens: ["linkedin"],
  },
};

export type SupportedPlatformKey = keyof typeof SUPPORTED_PLATFORMS;

type FilterOptions = {
  query?: string;
  onlySelected?: boolean;
  platformFilter?: SupportedPlatformKey | "all";
};

function extractQueryTokens(query: string) {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function inferPlatformFilter(tokens: string[]): SupportedPlatformKey | undefined {
  if (tokens.some((token) => SUPPORTED_PLATFORMS.youtube.tokens.includes(token))) return "youtube";
  if (tokens.some((token) => SUPPORTED_PLATFORMS.x.tokens.includes(token))) return "x";
  if (tokens.some((token) => SUPPORTED_PLATFORMS.linkedin.tokens.includes(token))) return "linkedin";
  return undefined;
}

function isPlatformToken(token: string) {
  return Object.values(SUPPORTED_PLATFORMS).some((platform) => platform.tokens.includes(token));
}

function normalizePlatform(raw?: string | null): SupportedPlatformKey | undefined {
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  if (normalized.includes("youtube") || normalized.includes("yt")) return "youtube";
  if (normalized.includes("twitter") || normalized === "x" || normalized.includes("x/")) return "x";
  if (normalized.includes("linkedin")) return "linkedin";
  return undefined;
}

export function getSupportedPlatformLabel(rawPlatform?: string | null) {
  const key = normalizePlatform(rawPlatform);
  return key ? SUPPORTED_PLATFORMS[key].label : undefined;
}

export function getSupportedPlatformKey(rawPlatform?: string | null): SupportedPlatformKey | undefined {
  return normalizePlatform(rawPlatform);
}

function sortQuestions(a: BrandInsightsQuestion, b: BrandInsightsQuestion) {
  if (a.isSelected !== b.isSelected) {
    return a.isSelected ? -1 : 1;
  }
  if ((b.timesUsed ?? 0) !== (a.timesUsed ?? 0)) {
    return (b.timesUsed ?? 0) - (a.timesUsed ?? 0);
  }
  return a.question.localeCompare(b.question);
}

function matchesTextTokens(question: BrandInsightsQuestion, tokens: string[]) {
  if (tokens.length === 0) return true;
  const haystack = [
    question.question,
    question.whyRelevant,
    question.contentTypeSuggestion,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function filterAndSortQuestionsByNiche(
  questionsByNiche: QuestionsByNiche,
  options: FilterOptions
) {
  const normalizedQuery = (options.query ?? "").trim();
  const tokens = extractQueryTokens(normalizedQuery);
  const inferredPlatform = inferPlatformFilter(tokens);
  const activePlatformFilter =
    options.platformFilter && options.platformFilter !== "all"
      ? options.platformFilter
      : inferredPlatform;
  const textTokens = tokens.filter((token) => !isPlatformToken(token));
  const onlySelected = Boolean(options.onlySelected);

  return Object.entries(questionsByNiche ?? {})
    .map(([audience, nicheQuestions]) => {
      const filteredQuestions = (nicheQuestions.questions ?? [])
        .filter((question) => {
          if (!activePlatformFilter) return true;
          return normalizePlatform(question.socialPlatform) === activePlatformFilter;
        })
        .filter((question) => matchesTextTokens(question, textTokens))
        .filter((question) => (onlySelected ? question.isSelected : true))
        .sort(sortQuestions);

      return {
        audience,
        questions: filteredQuestions,
        totalGenerated: nicheQuestions.totalGenerated,
      };
    })
    .filter(({ questions }) => questions.length > 0)
    .sort((a, b) => a.audience.localeCompare(b.audience));
}
