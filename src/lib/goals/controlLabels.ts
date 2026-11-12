import type { useTranslations } from 'next-intl';

const KEYS = {
  draft: 'm_23d33e22ac',
  active: 'm_a733b809d2',
  blocked: 'm_99613c74ce',
  complete: 'm_1f5a1abf2f',
  archived: 'm_eddc813f35',
  in_review: 'm_c49bceb8a7',
  needs_changes: 'm_98f2914761',
  accepted: 'm_61a0572c48',
  waived: 'm_21a493a5b5',
  strategy: 'm_69fb26dda8',
  research: 'm_be601df25e',
  paid_media: 'm_5f9c32ebbf',
  organic: 'organic_89b8cb6',
  creative: 'm_20ccbc66c1',
  creative_ops: 'm_7e8ea36557',
  budget_authority: 'm_ce7340242a',
  brand_authority: 'm_bd26df34ba',
  measurement: 'm_de10edfac7',
  conversion: 'm_9151f8433f',
  brand: 'm_62b4aa574f',
  operations: 'm_a1fdaa6b2a',
  compliance: 'm_68f0ae4911',
  on_track: 'm_38350e8c01',
  waiting_on_teammate: 'm_158d309b1e',
  waiting_on_external: 'm_85b5207017',
  at_risk: 'm_b04189af94',
  needs_approval: 'm_a3b42549d1',
  ready_to_publish: 'm_f83f8c747e',
  launching: 'm_4db5c673f7',
  live_optimizing: 'm_18ccd2056e',
  failed_recovery_needed: 'm_7bdda42c8d',
  completed: 'm_1798b3ba42',
} as const;
export function goalControlLabel(
  code: string,
  t: ReturnType<typeof useTranslations<'dashboard'>>,
): string {
  return Object.hasOwn(KEYS, code)
    ? t(KEYS[code as keyof typeof KEYS])
    : code.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
