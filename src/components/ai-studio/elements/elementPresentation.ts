import type { ElementCategory, ElementUseIntent } from '@continuum/contracts';
import type { useTranslations } from 'next-intl';
import type StudioMessages from '../../../../messages/studio/en.json';

type StudioText = ReturnType<typeof useTranslations<'studio'>>;
const CATEGORY_KEYS = {
  model: 'elementCategoryModel',
  character: 'elementCategoryCharacter',
  product: 'elementCategoryProduct',
  object: 'elementCategoryObject',
  material: 'elementCategoryMaterial',
  setting: 'elementCategorySetting',
  location: 'elementCategoryLocation',
  landscape: 'elementCategoryLandscape',
  style: 'elementCategoryStyle',
  moodboard: 'elementCategoryMoodboard',
  palette: 'elementCategoryPalette',
  animation: 'elementCategoryAnimation',
  effect: 'elementCategoryEffect',
  general: 'elementCategoryGeneral',
} as const satisfies Record<ElementCategory, keyof typeof StudioMessages>;
const GUIDANCE_KEYS = {
  model: 'elementGuidanceModel',
  character: 'elementGuidanceCharacter',
  product: 'elementGuidanceProduct',
  object: 'elementGuidanceObject',
  material: 'elementGuidanceMaterial',
  setting: 'elementGuidanceSetting',
  location: 'elementGuidanceLocation',
  landscape: 'elementGuidanceLandscape',
  style: 'elementGuidanceStyle',
  moodboard: 'elementGuidanceMoodboard',
  palette: 'elementGuidancePalette',
  animation: 'elementGuidanceAnimation',
  effect: 'elementGuidanceEffect',
  general: 'elementGuidanceGeneral',
} as const satisfies Record<ElementCategory, keyof typeof StudioMessages>;
const INTENT_KEYS = {
  subject: 'elementIntentSubject',
  environment: 'elementIntentEnvironment',
  treatment: 'elementIntentTreatment',
  palette: 'elementIntentPalette',
  motion: 'elementIntentMotion',
} as const satisfies Record<ElementUseIntent, keyof typeof StudioMessages>;

/** Controlled enum labels only; source-authored names and stored categories remain untouched. */
export function elementCategoryLabel(category: ElementCategory, t: StudioText): string {
  return Object.hasOwn(CATEGORY_KEYS, category) ? t(CATEGORY_KEYS[category]) : category;
}
export function elementCategoryGuidance(category: ElementCategory, t: StudioText): string {
  return t(GUIDANCE_KEYS[category]);
}
export function elementUseIntentLabel(intent: ElementUseIntent, t: StudioText): string {
  return t(INTENT_KEYS[intent]);
}
