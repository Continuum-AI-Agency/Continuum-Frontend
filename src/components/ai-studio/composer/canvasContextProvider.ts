import type {
  ElementRecord,
  EventSignal,
  QuestionSignal,
  Skill,
  TrendSignal,
} from '@continuum/contracts';
import { currentWeekStartDateUtc } from '@continuum/contracts';
import {
  type FetchMediaMentionAssetsInput,
  fetchMediaLibraryFolders,
  fetchMediaMentionAssets,
  parseMediaFolderKey,
} from '@/lib/agent/media-mentions';
import type { AgentMentionProvider, AgentMentionSuggestion } from '@/lib/agent-references';
import { ELEMENT_CATEGORY_LABEL } from '@/lib/ai-studio/elements';
import { fetchBrandInsightsWeek } from '@/lib/api/brandInsights.client';
import {
  ELEMENTS_ROOT_KEY,
  elementCategoryFolderKey,
  elementSuggestionsByCategory,
  parseElementCategoryFolderKey,
} from './elementMentions';

const SKILLS_ROOT_KEY = 'canvas-context:skills';
const BRAND_SKILLS_KEY = 'canvas-context:brand-skills';
const SKILL_LIBRARY_KEY = 'canvas-context:skill-library';
const MEDIA_ROOT_KEY = 'canvas-context:media-library';
const SIGNALS_ROOT_KEY = 'canvas-context:signals';
const SIGNALS_TRENDS_KEY = 'canvas-context:signals-trends';
const SIGNALS_EVENTS_KEY = 'canvas-context:signals-events';
const SIGNALS_QUESTIONS_KEY = 'canvas-context:signals-questions';

// D-05 cheap fix: the backend Continuum-Backend/App/ai-studio/canvas/agent/
// composerContext.ts throws for trend/event/question — a single picked signal kills
// the whole run (its skills and media refs included) and paints the raw internal
// error. Withhold every signal suggestion (root folder + free-text matches) —
// re-enable when the resolver lands by flipping this flag (one revert).
const SIGNALS_RESOLVER_LANDED = false;

type FetchAssets = (input: FetchMediaMentionAssetsInput) => Promise<AgentMentionSuggestion[]>;
type FetchFolders = (brandId: string, source?: 'canvas') => Promise<AgentMentionSuggestion[]>;

/** This week's brand signals, already shaped as canvas mention suggestions. */
export interface CanvasSignalCatalog {
  trends: AgentMentionSuggestion[];
  events: AgentMentionSuggestion[];
  questions: AgentMentionSuggestion[];
}

type FetchSignals = (brandId: string) => Promise<CanvasSignalCatalog>;

const EMPTY_SIGNALS: CanvasSignalCatalog = { trends: [], events: [], questions: [] };

const signalSuggestion = (input: {
  id: string;
  label: string;
  type: 'trend' | 'event' | 'question';
  group: string;
  badge: string;
  description?: string;
  metadata: Record<string, unknown>;
}): AgentMentionSuggestion => ({
  key: `canvas-${input.type}:${input.id}`,
  label: input.label,
  type: input.type,
  source: 'canvas',
  group: input.group,
  ...(input.description ? { description: input.description } : {}),
  badge: input.badge,
  reference: {
    id: input.id,
    type: input.type,
    label: input.label,
    source: 'canvas',
    metadata: input.metadata,
  },
});

export function trendToCanvasMentionSuggestion(trend: TrendSignal): AgentMentionSuggestion {
  return signalSuggestion({
    id: trend.id,
    label: trend.title,
    type: 'trend',
    group: 'Trends',
    badge: 'trend',
    description: trend.description ?? trend.relevanceToBrand,
    metadata: { source: trend.source, relevanceToBrand: trend.relevanceToBrand },
  });
}

export function eventToCanvasMentionSuggestion(event: EventSignal): AgentMentionSuggestion {
  return signalSuggestion({
    id: event.id,
    label: event.title,
    type: 'event',
    group: 'Events',
    badge: 'event',
    description: event.opportunity ?? event.description,
    metadata: { date: event.date, opportunity: event.opportunity },
  });
}

export function questionToCanvasMentionSuggestion(
  question: QuestionSignal,
): AgentMentionSuggestion {
  return signalSuggestion({
    id: question.id,
    label: question.question,
    type: 'question',
    group: 'Questions',
    badge: 'question',
    description: question.whyRelevant ?? question.contentTypeSuggestion,
    metadata: { niche: question.niche, socialPlatform: question.socialPlatform },
  });
}

// The canvas has no planner page to hand it a signals context, so it reads this
// week's collection itself. A brand with no generation this week simply has empty
// Signals folders — never a thrown mention menu.
const fetchCanvasSignals: FetchSignals = async (brandId) => {
  const insights = await fetchBrandInsightsWeek({
    brandId,
    weekStartDate: currentWeekStartDateUtc(),
  }).catch(() => null);
  if (!insights) return EMPTY_SIGNALS;

  const nicheMap = insights.data.questionsByNiche.questionsByNiche ?? {};
  const questions = Object.entries(nicheMap).flatMap(([niche, entry]) =>
    (entry as { questions: QuestionSignal[] }).questions.map((question) =>
      questionToCanvasMentionSuggestion({ ...question, niche: question.niche ?? niche }),
    ),
  );

  return {
    trends: insights.data.trendsAndEvents.trends.map(trendToCanvasMentionSuggestion),
    events: insights.data.trendsAndEvents.events.map(eventToCanvasMentionSuggestion),
    questions,
  };
};

const matches = (suggestion: AgentMentionSuggestion, query: string): boolean => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [suggestion.label, suggestion.description, suggestion.badge].some((value) =>
    value?.toLowerCase().includes(normalized),
  );
};

const isComposableSkill = (skill: Skill): boolean =>
  skill.status === 'active' &&
  skill.kind === 'creative_direction' &&
  (skill.surface === 'visual' || skill.surface === 'both');

export function skillToCanvasMentionSuggestion(skill: Skill): AgentMentionSuggestion {
  const label = skill.slug ?? skill.name;
  return {
    key: `canvas-skill:${skill.id}`,
    label,
    type: 'skill',
    source: 'canvas',
    group: skill.isTemplate ? 'Skill library' : 'Brand skills',
    description: [skill.surface === 'both' ? 'copy + visual' : 'visual', skill.description]
      .filter(Boolean)
      .join(' · '),
    badge: 'skill',
    reference: {
      id: skill.id,
      type: 'skill',
      label,
      source: 'canvas',
      metadata: { skillId: skill.id, kind: skill.kind, slug: skill.slug },
    },
  };
}

const folder = (
  key: string,
  label: string,
  type: AgentMentionSuggestion['type'],
  childrenLabel: string,
): AgentMentionSuggestion => ({
  key,
  label,
  type,
  source: 'canvas',
  childrenLabel,
  isFolder: true,
});

const isCanvasMedia = (suggestion: AgentMentionSuggestion): boolean => {
  const kind = suggestion.reference?.metadata?.kind;
  return kind === 'image' || kind === 'video';
};

export function createCanvasComposerMentionProvider({
  brandId,
  skills,
  elements = [],
  fetchAssets = fetchMediaMentionAssets,
  fetchFolders = fetchMediaLibraryFolders,
  fetchSignals = fetchCanvasSignals,
}: {
  brandId: string;
  skills: Skill[];
  /** The brand's Elements. Already loaded by the composer — no fetch of its own. */
  elements?: readonly ElementRecord[];
  fetchAssets?: FetchAssets;
  fetchFolders?: FetchFolders;
  fetchSignals?: FetchSignals;
}): AgentMentionProvider {
  const skillSuggestions = skills.filter(isComposableSkill).map(skillToCanvasMentionSuggestion);
  const brandSkills = skillSuggestions.filter((item) => item.group === 'Brand skills');
  const librarySkills = skillSuggestions.filter((item) => item.group === 'Skill library');

  // Elements are grouped by category (PRD feature 9) — and this menu's only grouping
  // affordance is the folder drill, so a category IS a folder. Empty categories are
  // not offered: a folder that opens on nothing is a dead end.
  const elementsByCategory = elementSuggestionsByCategory(elements);
  const elementSuggestions = [...elementsByCategory.values()].flat();
  const elementCategoryFolders = [...elementsByCategory.entries()].map(([category, bucket]) =>
    folder(
      elementCategoryFolderKey(category),
      ELEMENT_CATEGORY_LABEL[category],
      'media_asset',
      `${bucket.length} element${bucket.length === 1 ? '' : 's'}`,
    ),
  );

  // One read per provider instance: opening Signals, drilling into Trends and
  // then back into Questions must not re-fetch the week three times.
  let signalsPromise: Promise<CanvasSignalCatalog> | null = null;
  const signals = (): Promise<CanvasSignalCatalog> => {
    if (!SIGNALS_RESOLVER_LANDED) return Promise.resolve(EMPTY_SIGNALS);
    signalsPromise ??= fetchSignals(brandId).catch(() => EMPTY_SIGNALS);
    return signalsPromise;
  };

  return {
    getSuggestions: async ({ query }) => {
      if (!query.trim()) {
        return [
          folder(SKILLS_ROOT_KEY, 'Skills', 'skill', 'Brand skills & library'),
          ...(elementSuggestions.length > 0
            ? [folder(ELEMENTS_ROOT_KEY, 'Elements', 'media_asset', 'Saved subjects by category')]
            : []),
          folder(MEDIA_ROOT_KEY, 'Media library', 'media_asset', 'Images & videos'),
          ...(SIGNALS_RESOLVER_LANDED
            ? [folder(SIGNALS_ROOT_KEY, 'Signals', 'trend', 'Trends, events, questions')]
            : []),
        ];
      }
      const [media, catalog] = await Promise.all([
        fetchAssets({ brandId, query, limit: 8, referenceSource: 'canvas' }).catch(() => []),
        signals(),
      ]);
      return [
        ...skillSuggestions.filter((item) => matches(item, query)),
        ...elementSuggestions.filter((item) => matches(item, query)),
        ...media.filter(isCanvasMedia),
        ...[...catalog.trends, ...catalog.events, ...catalog.questions].filter((item) =>
          matches(item, query),
        ),
      ];
    },
    getChildSuggestions: async (parent, query) => {
      if (parent.key === SKILLS_ROOT_KEY) {
        return [
          folder(BRAND_SKILLS_KEY, 'Brand skills', 'skill', 'Your visual skills'),
          folder(SKILL_LIBRARY_KEY, 'Library', 'skill', 'First-party templates'),
        ];
      }
      if (parent.key === BRAND_SKILLS_KEY)
        return brandSkills.filter((item) => matches(item, query));
      if (parent.key === SKILL_LIBRARY_KEY) {
        return librarySkills.filter((item) => matches(item, query));
      }
      if (parent.key === ELEMENTS_ROOT_KEY) return elementCategoryFolders;
      const elementCategory = parseElementCategoryFolderKey(parent.key);
      if (elementCategory) {
        return (elementsByCategory.get(elementCategory) ?? []).filter((item) =>
          matches(item, query),
        );
      }
      if (parent.key === SIGNALS_ROOT_KEY) {
        return [
          folder(SIGNALS_TRENDS_KEY, 'Trends', 'trend', 'This week’s trends'),
          folder(SIGNALS_EVENTS_KEY, 'Events', 'event', 'Upcoming events'),
          folder(SIGNALS_QUESTIONS_KEY, 'Questions', 'question', 'Audience questions'),
        ];
      }
      if (parent.key === SIGNALS_TRENDS_KEY) {
        return (await signals()).trends.filter((item) => matches(item, query));
      }
      if (parent.key === SIGNALS_EVENTS_KEY) {
        return (await signals()).events.filter((item) => matches(item, query));
      }
      if (parent.key === SIGNALS_QUESTIONS_KEY) {
        return (await signals()).questions.filter((item) => matches(item, query));
      }
      if (parent.key === MEDIA_ROOT_KEY) {
        return query.trim().length >= 2
          ? (
              await fetchAssets({
                brandId,
                query,
                limit: 12,
                referenceSource: 'canvas',
              }).catch(() => [])
            ).filter(isCanvasMedia)
          : fetchFolders(brandId, 'canvas');
      }
      const mediaFolder = parseMediaFolderKey(parent.key);
      if (!mediaFolder) return [];
      return (
        await fetchAssets({
          brandId,
          query,
          limit: 24,
          referenceSource: 'canvas',
          ...mediaFolder,
        }).catch(() => [])
      ).filter(isCanvasMedia);
    },
  };
}
