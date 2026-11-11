import type { AiStudioMedium, AiStudioProvider, AiStudioTemplate } from '@/lib/schemas/aiStudio';

type TemplateFilter = {
  provider?: AiStudioProvider;
  medium?: AiStudioMedium;
};

const FALLBACK_TEMPLATES: AiStudioTemplate[] = [
  {
    id: 'nano-hero-product',
    name: 'Hero Product Spotlight',
    description:
      'Cinematic light-beam setup highlighting your flagship product on branded gradients.',
    provider: 'nano-banana',
    medium: 'image',
    aspectRatio: '4:5',
    defaultPrompt:
      'Photoreal hero product shot of {brand} flagship item floating above a glass podium, volumetric lighting, branded gradients, crisp focus, studio reflections.',
    defaultNegativePrompt:
      'blurry, low resolution, distorted, watermarks, text overlay, extra limbs, disfigured',
    metadata: {
      tone: 'premium',
      lighting: 'volumetric',
      recommendedColors: ['#7DD3FC', '#1E293B', '#F8FAFC'],
    },
    tags: ['Product', 'Launch', 'Paid'],
  },
  {
    id: 'nano-campaign-flatlay',
    name: 'Campaign Flatlay',
    description:
      'Editorial flatlay arrangement with props that telegraph campaign story and palette.',
    provider: 'nano-banana',
    medium: 'image',
    aspectRatio: '16:9',
    defaultPrompt:
      'Flatlay scene showing {brand} kit with supporting props, top-down camera, soft afternoon light, styled typography card, clean shadows.',
    defaultNegativePrompt: 'messy, harsh light, cluttered, text errors, extra hands',
    metadata: {
      tone: 'lifestyle',
      props: ['notebook', 'ceramic mug', 'tablet display'],
      surfaces: ['linen', 'stone'],
    },
    tags: ['Organic', 'Lifestyle'],
  },
  {
    id: 'veo-motion-anthem',
    name: 'Motion Anthem Loop',
    description:
      'High-energy b-roll with macro details, parallax moves, and bold typography transitions.',
    provider: 'veo-3-1',
    medium: 'video',
    aspectRatio: '9:16',
    defaultPrompt:
      'Cinematic montage of {brand} team collaborating in a luminous studio, macro product details, smooth gimbal shots, motivational energy, vibrant lighting transitions.',
    metadata: {
      tone: 'energetic',
      durationHint: 12,
      musicCue: 'uplifting electronic',
    },
    tags: ['B-Roll', 'Brand Story'],
  },
  {
    id: 'veo-lite-quick-concept',
    name: 'Quick Concept Video',
    description: 'Fast short-form concept loop for high-volume creative iteration.',
    provider: 'veo-3-1-lite',
    medium: 'video',
    aspectRatio: '16:9',
    defaultPrompt:
      'High-energy product concept video for {brand}, crisp motion, natural audio ambience, fast social-ready pacing.',
    metadata: {
      tone: 'iterative',
      durationHint: 8,
      musicCue: 'bright rhythmic pulse',
    },
    tags: ['Concept', 'Iteration'],
  },
  {
    id: 'sora-storyboard',
    name: 'Storyboard Narrative',
    description:
      'Long-form narrative shot list for launch storytelling across hero, context, and CTA beats.',
    provider: 'sora-2',
    medium: 'video',
    aspectRatio: '16:9',
    defaultPrompt:
      'Three-act story of a founder using {brand} platform to orchestrate a product launch. Act 1: ideation in dawn light. Act 2: team collaboration with dashboards. Act 3: product reveal event with cheering audience.',
    metadata: {
      tone: 'inspirational',
      durationHint: 45,
      chapters: ['Ideation', 'Collaboration', 'Reveal'],
    },
    tags: ['Narrative', 'Hero'],
  },
];

export function getFallbackTemplates(filter: TemplateFilter): AiStudioTemplate[] {
  return FALLBACK_TEMPLATES.filter((template) => {
    if (filter.provider && template.provider !== filter.provider) return false;
    if (filter.medium && template.medium !== filter.medium) return false;
    return true;
  });
}
