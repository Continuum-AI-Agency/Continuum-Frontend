import type {
  GoalChecklistCollectionPolicy,
  GoalChecklistItemStatus,
  GoalChecklistRequirementDefinition,
} from '@continuum/contracts';
import type { GoalDisplayTranslator } from './displayCopy';

const labels = {
  'Business and campaign objective': 'm_f28510b0e6',
  'Scope and offer': 'm_8fa584f442',
  'Measurable success criteria': 'm_1d58672088',
  'Approved budget and timing': 'm_4e74fd2a09',
  'Campaign constraints': 'm_3953a36160',
  'Explicit non-goals': 'm_63426dc197',
  'Decision rights': 'm_a0c9620457',
  'Research questions': 'm_9f62d9f131',
  'Market and category findings': 'm_acf54d8035',
  'Customer findings': 'm_b05a1eb5a8',
  'Competitor findings': 'm_d8e6a7d91d',
  'Material unknowns': 'm_5eb319c5c8',
  'Strategic implications': 'm_51a281efbc',
  'Strategic thesis': 'm_cc960f8a03',
  'Objective and offer interpretation': 'm_5b881524cd',
  'Journey and channel roles': 'm_24201a7c9c',
  'Strategic priorities': 'm_c3bf1fcf55',
  'Strategic tradeoffs': 'm_6473e83958',
  Assumptions: 'assumptions_69ef1ef',
  Risks: 'm_92ddd0d287',
  'Binding strategy decisions': 'm_b4d34328a6',
  'Priority audience segments': 'm_3d79a9cf72',
  'Audience exclusions': 'm_9d05d9db95',
  'Audience overlap policy': 'm_58dab53fa5',
  'Audience privacy constraints': 'm_070781c5ae',
  'Creative angles': 'm_6d75e73d8d',
  'Message hierarchy': 'm_3051df976f',
  'Substantiated claims': 'm_3dde7ef37e',
  'Call to action': 'm_95c9c0e045',
  'Destination URL': 'm_935336fdf4',
  'Creative concepts': 'm_44cf39cb51',
  'Creative guardrails': 'm_4d7a00f9d0',
  'Approved creative asset versions': 'm_5da35163b4',
  'Production schedule': 'm_ed1557cb40',
  'Review and QA gates': 'm_fcef10cdb1',
  'Rights and usage terms': 'm_b96416ec8c',
  'Authorized total budget': 'm_caeef6554b',
  'Channel budget allocation': 'm_5572d1df61',
  'Media flight': 'm_52621acd80',
  'Pacing strategy': 'm_b528d51087',
  'Targeting rules': 'm_8bb36499e7',
  'Budget scenarios': 'm_229a21a466',
  'Optimization rules': 'm_ef129df0b6',
  'Budget authorization': 'm_0bab1dfeae',
  'KPI tree': 'm_8c293c620a',
  'Metric definitions': 'm_dd8c933398',
  'Measurement source of truth': 'm_f832bd93a7',
  'Campaign naming convention': 'm_f7aaca7593',
  'Events and conversions': 'm_dedefd4449',
  'Attribution approach': 'm_71aacfc5d6',
  'Reporting cadence': 'm_5119db57ae',
  'Measurement QA approval': 'm_e64bcc6cd8',
  'Approved claims register': 'm_823d0c88fb',
  'Brand and legal reviews': 'm_3239683a84',
  'Platform policy reviews': 'm_a02d5de137',
  'Privacy and consent controls': 'm_1c0f0be4f2',
  'Accessibility checks': 'm_0a3ddf6b2b',
  'Approved compliance exceptions': 'm_8e815c7986',
  'Final compliance approval': 'm_0e2e9e1dfc',
  'Accepted artifact versions': 'm_9e3ab87387',
  'Compliance approval': 'm_cc8183d82e',
  'Destination QA result': 'm_374c239e5c',
  'Operational owners': 'm_cb3371cf25',
  'Go or no-go decision': 'm_166111d67c',
  'Rollback owner': 'm_5b74d31b65',
  'Escalation owner': 'm_da98e3129d',
  'Campaign name': 'campaign_name_e092a1f',
  'Campaign objective': 'm_b72ccbf75f',
  'Executable channels': 'm_f0bd784c5c',
  'Executable budget': 'm_0f861d3340',
  'Executable flight': 'm_08860ed635',
  'Executable audiences': 'm_3532f09965',
  'Approved creative versions': 'm_e2ce03c468',
  'Measurement version pin': 'm_c19c600fdb',
  'Compliance version pin': 'm_4263c4532c',
  'Launch-readiness version pin': 'm_43e0e61f0e',
  'Accepted artifact version pins': 'm_114ff55c3f',
  'Binding approval decisions': 'm_ebb85bf3b0',
  'Zero unresolved blockers': 'm_e5f5448016',
  'Offer definition': 'm_21417c84f2',
  'Value exchange': 'm_bdde8ab868',
  'Conversion journey': 'm_a71e6b28ae',
  'Destination requirements': 'm_41cf18a97c',
  'Destination owners': 'm_95ae5be0b1',
  'Content and merchandising': 'm_a85efc3251',
  'Tracking and consent': 'm_0453cf32f3',
  'Destination QA approval': 'm_d057950fb3',
  'Lifecycle entry criteria': 'm_ec91ae8c3f',
  'Lifecycle message sequence': 'm_61cd4c9cfa',
  'Segmentation and suppression': 'm_3d79c30a32',
  'Lifecycle handoffs': 'm_8c8e8b16a6',
  'Automation requirements': 'm_8c1bc478a0',
  'Lifecycle measurement QA': 'm_4397e3d416',
  'Partner profiles': 'm_64f55cd111',
  'Partner deliverables': 'm_4817df3f96',
  'Commercial terms': 'm_d06a2e14f5',
  'Rights and disclosures': 'm_c3e4a5d46b',
  'Review and publishing workflow': 'm_80f36d5139',
  'Partnership tracking': 'm_fc48f2fc36',
  'Partnership compliance approval': 'm_51c3a513c5',
  'Market and language priorities': 'm_2d6578f0a4',
  'Cultural context': 'm_fb5c5297be',
  'Offer and message adaptations': 'm_91f2c01cf0',
  'Creative localization': 'm_905591171e',
  'Local legal and policy differences': 'm_33b29b3ffb',
  'Local market QA approvals': 'm_1d41ec94a3',
  'Experiment decision': 'm_707614e5d2',
  'Falsifiable hypothesis': 'm_cee963ffe6',
  'Experiment variants': 'm_d5dffd3509',
  'Control definition': 'm_2538a11516',
  'Experiment population': 'm_7d86881da4',
  'Experiment allocation': 'm_57238bd931',
  'Experiment metrics': 'm_80ae2a9ea4',
  'Experiment guardrails': 'm_da2abcae2b',
  'Experiment duration': 'm_ff61cc9c38',
  'Stopping rules': 'm_d1f19a3259',
  'Analysis and decision rule': 'm_7dab3ee327',
  'Desired outcome and what winning means': 'm_89f610abfc',
  'Primary metric the trial ranks on': 'm_918e0b2b41',
  'Which arms run (organic, paid confirmation)': 'm_a649d330c1',
  'Trial fence (rounds, variants, floors, caps)': 'm_5a013d8851',
  'Graduation strategy for a winning reel': 'm_0aa7d07578',
  'Who approves slates and graduation': 'm_c0a920b3c6',
  'The creative space to search': 'm_924df8f0af',
  'Evidence-backed prior beliefs': 'm_1ed6c2b7e6',
  'Options deliberately not tested': 'm_7561665b00',
  'Every round and every variant observed': 'm_92c89b384a',
  'The engine verdict recorded per round': 'm_795f965b91',
  'Whether the trial converged or was exhausted': 'm_bbe0902481',
  'The winning coordinate, if one was proven': 'm_a290bb3bc0',
  'What this trial could not establish': 'm_7d3d34f046',
  'Graduation of the winner to followers': 'm_b7f022b531',
} as const;
const statuses = {
  pending: 'pending_331551b',
  researching: 'm_e309e56088',
  awaiting_input: 'm_722c0db8d0',
  awaiting_approval: 'm_d0a0d8070f',
  resolved: 'm_d999aeb054',
  blocked: 'm_99613c74ce',
  waived: 'm_21a493a5b5',
  stale: 'm_189cc40c22',
} as const satisfies Record<GoalChecklistItemStatus, string>;
const policies = {
  stakeholder_required: 'm_77753d037c',
  authoritative_system: 'm_912ed2cde9',
  evidence_required: 'm_7eabf092b4',
  tool_or_stakeholder: 'm_921721ddfc',
  derived: 'm_051996842e',
  approval_required: 'm_b8d012c200',
} as const satisfies Record<GoalChecklistCollectionPolicy, string>;
const blockers = {
  'This value requires an attributable stakeholder response.': 'm_0a05be3835',
  'This value requires an attributable approval response.': 'm_cacf23b946',
  'This value must come from an authoritative tool or accepted artifact version.': 'm_26ffb66480',
  'This value requires a tool result, evidence, accepted artifact, or stakeholder response.':
    'm_1fee1017a3',
  'Model-derived values cannot claim confidence above 0.70.': 'm_399ba5bb9c',
} as const;
/** Only canonical application definitions are UI chrome. Custom or generated questions remain content. */
export function goalChecklistCopy(
  definition: GoalChecklistRequirementDefinition,
  t: GoalDisplayTranslator,
) {
  const subject =
    definition.question ===
    `Provide or confirm ${definition.label.toLowerCase()} for this campaign.`
      ? 'campaign'
      : definition.question ===
          `Provide or confirm ${definition.label.toLowerCase()} for this trial.`
        ? 'trial'
        : null;
  if (!subject || !Object.hasOwn(labels, definition.label))
    return { label: definition.label, question: definition.question };
  const label = t(labels[definition.label as keyof typeof labels]);
  return { label, question: t('m_deb513e0f6', { label, subject }) };
}
export function goalChecklistStatus(status: GoalChecklistItemStatus, t: GoalDisplayTranslator) {
  return t(statuses[status]);
}
export function goalChecklistSummary(
  policy: GoalChecklistCollectionPolicy,
  requests: number,
  evidence: number,
  t: GoalDisplayTranslator,
) {
  return t('m_2e3bf18883', { policy: t(policies[policy]), requests, evidence });
}
export function goalChecklistBlocker(blocker: string, t: GoalDisplayTranslator) {
  if (Object.hasOwn(blockers, blocker)) return t(blockers[blocker as keyof typeof blockers]);
  const conf = blocker.match(/^Confidence (\d+\.\d+) is below the required (\d+\.\d+)\.$/);
  if (conf)
    return t('m_490fa21b55', {
      confidence: Number(conf[1]),
      required: Number(conf[2]),
    });
  const sources = blocker.match(/^This value requires at least (\d+) evidence source\.$/);
  if (sources) return t('m_c6017d796f', { count: Number(sources[1]) });
  return t('m_95aaf9c4a4');
}
