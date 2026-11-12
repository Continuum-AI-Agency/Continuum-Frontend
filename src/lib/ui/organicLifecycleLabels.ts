import type {useTranslations} from 'next-intl';
import {resolveOrganicAgentLabel,type OrganicLifecycleDisplay} from '@continuum/contracts';
type Translator=ReturnType<typeof useTranslations<'common'>>;
const LABEL_KEYS = {
  Concept: 'm_c05bafdb56',
  Seeded: 'm_51095bb5db',
  Queued: 'queued_661ff40',
  Generating: 'm_8d68733757',
  'Running · no updates yet': 'm_20bbe134b1',
  'Draft ready': 'm_0416eb93bc',
  Scheduled: 'm_1cd1bdad46',
  Published: 'm_483bf2075c',
  'Media didn’t render': 'm_2aea632b3e',
  Failed: 'failed_031a8f0',
  Cancelled: 'm_a1bf92eff4',
  Planning: 'm_0005027d89',
  Conceptualizing: 'm_c017c0b653',
  'Writing copy': 'm_6d4cee0feb',
  Designing: 'm_ea2984d647',
  'Generating media': 'm_6ce88b21fa',
  Reviewing: 'm_166ea85992',
  Finalizing: 'm_d428375c5c',
  Strategist: 'm_38b5add5eb',
  Creative: 'm_20ccbc66c1',
  Copywriter: 'm_0d9ba76ded',
  Hashtags: 'm_338da6e1c3',
  Audio: 'm_acdac205f5',
  Visual: 'm_770d690e6d',
  Designer: 'm_639dcae81e',
  Editor: 'm_c7e9fb2ea6',
  Reviser: 'm_9f67c93b6b',
  Post: 'm_7858ac3ff6',
  'Performance report': 'm_d8de1447c9',
  Ready: 'm_20c7c5522f',
  Validating: 'm_f61e59d62b',
  'Writing the executive summary': 'm_26338c52a1',
  'Writing KPIs': 'm_495f20306c',
  'Writing the campaign breakdown': 'm_86194f5db9',
  'Writing competitive context': 'm_fab9f1bd71',
  'Writing recommendations': 'm_96a55e98a2',
  'Assembling the report': 'm_e61fd5ef1b',
"Copy ready":"m_5d14901243","Preview ready":"m_8a02952660","Fleshing out":"m_832a5136bc","Fully fleshed out":"m_dd0d77827b"} as const;
export function translateOrganicControlLabel(value: string, t: Translator) {
  return Object.hasOwn(LABEL_KEYS, value) ? t(LABEL_KEYS[value as keyof typeof LABEL_KEYS]) : value;
}


export function localizeOrganicLifecycle(display:OrganicLifecycleDisplay,t:Translator):OrganicLifecycleDisplay{return {...display,label:translateOrganicControlLabel(display.label,t)};}
export function localizeOrganicAgentLabel(name:string|null|undefined,t:Translator):string|null{const label=resolveOrganicAgentLabel(name);return label===null?null:translateOrganicControlLabel(label,t);}
