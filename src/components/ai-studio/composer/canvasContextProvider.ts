import type { Skill } from '@continuum/contracts';
import {
  type FetchMediaMentionAssetsInput,
  fetchMediaLibraryFolders,
  fetchMediaMentionAssets,
  parseMediaFolderKey,
} from '@/lib/agent/media-mentions';
import type { AgentMentionProvider, AgentMentionSuggestion } from '@/lib/agent-references';

const SKILLS_ROOT_KEY = 'canvas-context:skills';
const BRAND_SKILLS_KEY = 'canvas-context:brand-skills';
const SKILL_LIBRARY_KEY = 'canvas-context:skill-library';
const MEDIA_ROOT_KEY = 'canvas-context:media-library';

type FetchAssets = (input: FetchMediaMentionAssetsInput) => Promise<AgentMentionSuggestion[]>;
type FetchFolders = (brandId: string, source?: 'canvas') => Promise<AgentMentionSuggestion[]>;

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
  type: 'skill' | 'media_asset',
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
  fetchAssets = fetchMediaMentionAssets,
  fetchFolders = fetchMediaLibraryFolders,
}: {
  brandId: string;
  skills: Skill[];
  fetchAssets?: FetchAssets;
  fetchFolders?: FetchFolders;
}): AgentMentionProvider {
  const skillSuggestions = skills.filter(isComposableSkill).map(skillToCanvasMentionSuggestion);
  const brandSkills = skillSuggestions.filter((item) => item.group === 'Brand skills');
  const librarySkills = skillSuggestions.filter((item) => item.group === 'Skill library');

  return {
    getSuggestions: async ({ query }) => {
      if (!query.trim()) {
        return [
          folder(SKILLS_ROOT_KEY, 'Skills', 'skill', 'Brand skills & library'),
          folder(MEDIA_ROOT_KEY, 'Media library', 'media_asset', 'Images & videos'),
        ];
      }
      const media = await fetchAssets({
        brandId,
        query,
        limit: 8,
        referenceSource: 'canvas',
      }).catch(() => []);
      return [
        ...skillSuggestions.filter((item) => matches(item, query)),
        ...media.filter(isCanvasMedia),
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
