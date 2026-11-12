import {
  getOptimizationMetricDefinition,
  type OptimizationMetricDefinition,
} from '@continuum/contracts';

export const OPTIMIZER_DISPLAY_EN = {
  entityAdSet: 'ad set',
  entityCampaign: 'campaign',
  entityAdGroup: 'ad group',
  entityAdSets: 'ad sets',
  entityCampaigns: 'campaigns',
  entityAdGroups: 'ad groups',
  entityPlatform: 'the ad platform',
  confidenceHigh: 'High',
  confidenceLow: 'Low',
  confidenceMedium: 'Medium',
  heldNoConversions: 'Held · no conversion signal',
  heldIncomplete: 'Held · incomplete data',
  heldCampaignBudget: 'Held · CBO/lifetime',
  heldLifetime: 'Held · lifetime budget',
  heldNoSpend: 'Held · no spend',
  heldNoBudget: 'Held · no budget of its own',
  heldNoGoal: 'Held · no declared goal',
  heldDifferentGoal: 'Held · different goal',
  held: 'Held',
  heldNotMovable: 'Held · budget not movable',
  heldNoConversionsHint:
    'Spending but no tracked conversions yet — budget left unchanged until signal arrives.',
  heldIncompleteHint: 'Not enough trailing-window history to score reliably — held this cycle.',
  heldCampaignBudgetHint:
    'Budget is managed at the campaign level (CBO or lifetime) — the optimizer does not touch it. Convert the campaign to ad-set budgets to optimize its ad sets.',
  heldLifetimeHint:
    'This campaign has a whole-flight lifetime budget, not a daily one. The optimizer paces and scores in daily terms, so it will not resize a flight it cannot reason about.',
  heldNoOwnBudgetMetaHint:
    'This ad set has no ad-set budget for the optimizer to move — boosted posts and promoted posts usually look like this. It is left alone rather than handed a share of the pool it never had. Give it an ad-set daily budget in Meta if you want the optimizer to manage it.',
  heldNoGoalMetaHint:
    'This ad set does not tell Meta what result it is buying, and it has produced none of the results this portfolio measures. Scoring it would rank it on events it never claimed to buy, so it is held instead. Set an optimization goal on the ad set in Meta.',
  heldHint: 'Budget left unchanged on purpose this cycle.',
  notDelivering: 'Not delivering',
  deliveryFalling: 'Delivery falling',
  notDeliveringHint:
    'Meta shows this ad set as live, and it has served nothing for days. Every cost and rate on this row is computed from the days before it stopped — treat them as history, not as current performance.',
  deliveryFallingHint:
    'Impressions are down by more than half against the previous week at the same budget. Efficiency figures here are drawn from a much smaller sample than they were.',
  pauseAdSet: 'Pause ad set',
  refreshCreative: 'Refresh creative',
  expandAudience: 'Expand audience',
  changeSetting: 'Change a setting',
  pauseThisAd: 'Pause this ad',
  makeWinnerVariations: 'Make variations of the winner',
  addVariants: 'Nothing to learn from — add variants',
  notBeingDelivered: 'Not being delivered',
  applySetting: 'Apply setting',
  pauseAd: 'Pause ad',
  requestCreative: 'Request creative',
  trackThis: 'Track this',
  approve: 'Approve',
  pauseAdAdvisory:
    'Not built yet — the optimizer can find this ad but cannot pause it for you. Pause it in Meta and it stops draining the ad set.',
  requestCreativeAdvisory:
    'Approving opens a creative request with the brief below — a task your team fills, or a generation job when this portfolio has autogen on.',
  trackDeliveryAdvisory:
    'The optimizer will not resume an ad set for you — it is usually off because somebody turned it off. Approving keeps it on the list until delivery comes back.',
  pauseNotBuilt:
    'Pausing an ad from here is not built yet. The finding is real — pause it in Meta and it will stop draining the ad set.',
  variationsNotBuilt:
    'Generating variations from here is not built yet. Copy the brief and take it into AI Studio.',
  experimentNotBuilt:
    'Seeding an experiment from here is not built yet. Add a second creative to this ad set and the optimizer can start telling you which one works.',
  actionNotBuilt: 'This action is not built yet.',
  scopeBudget: 'budget moves',
  scopeCreative: 'creative rotation',
  scopeAudienceChange: 'audience replacements',
  scopeNewAudience: 'new audiences',
  scopeNewCreatives: 'flash creatives',
  scopeCrossPlatform: 'moves between platforms',
  scopeNothing: 'nothing yet',
  observeExplainer:
    'Observe — the optimizer scores every night but never changes a budget. Switch to Recommend to start approving its moves.',
  autopilotExplainer:
    'Autopilot — budgets change automatically, within your guardrails. Stop halts every write without leaving this mode.',
  recommendExplainer:
    'Recommend — the optimizer proposes moves and nothing changes until you approve them.',
  unknownApplyMode: 'Unknown apply mode.',
  modeObserve: 'Observe',
  modeRecommend: 'Recommend',
  modeAutopilot: 'Autopilot',
  noUpperBound: 'no upper bound yet ({count, plural, one {# conversion} other {# conversions}})',
  volumeUnder:
    '{events,plural,one {# conversion} other {# conversions}} in 14 days · {under,plural,one {# ad set} other {# ad sets}} under the {floor,number}-event floor',
  volumeAll:
    '{events,plural,one {# conversion} other {# conversions}} in 14 days · every ad set clears the {floor,number}-event floor',
  heldNoSpendHint:
    'This {entity} spent nothing in the last 14 days, so there is nothing to score it on and nothing of its own to redistribute — budget left unchanged. If it is funded and not being served, the delivery finding beside it says so.',
  heldMismatchHint:
    'This {entity} is bidding for a different result than the portfolio prices (for example messaging conversations in a portfolio measured on leads). Ranking them together would compare a cheap event against an expensive one and hand the budget to whichever is cheaper, so it is held instead. Move it to a portfolio that measures what it actually buys.',
  platformBudgetHint:
    "The optimizer cannot move this {entity}'s budget: it is shared with other campaigns, set at the campaign level, or the campaign type is read-only through the {platform} API. It is left unchanged.",
  platformNoBudgetHint:
    'This {entity} has no budget of its own for the optimizer to move. It is left alone rather than handed a share of the pool it never had. Give it a daily budget in {platform} if you want the optimizer to manage it.',
  platformNoGoalHint:
    'This {entity} does not tell {platform} what result it is buying, and it has produced none of the results this portfolio measures. Scoring it would rank it on events it never claimed to buy, so it is held instead. Set a conversion goal on the {entity} in {platform}.',
  autopilotScopesExplainer:
    'Autopilot — approves {scopes} on its own; budget moves stay within your guardrails and anything created is born paused. Stop halts all of it without leaving this mode.',
  metricPurchases: 'Purchases',
  metricCPA: 'CPA',
  metricTargetCPA: 'Target CPA',
  metricInstalls: 'Installs',
  metricCPI: 'CPI',
  metricTargetCPI: 'Target CPI',
  metricSignUps: 'Sign-ups',
  metricCostPerSignUp: 'Cost per sign-up',
  metricTargetCostPerSignUp: 'Target cost per sign-up',
  metricLeads: 'Leads',
  metricCPL: 'CPL',
  metricTargetCPL: 'Target CPL',
  metricLandingPageViews: 'Landing page views',
  metricCostPerLPV: 'Cost per LPV',
  metricTargetCostPerLPV: 'Target cost per LPV',
  metricImpressions: 'Impressions',
  metricCPM: 'CPM',
  metricTargetCPM: 'Target CPM',
  metricConversations: 'Conversations',
  metricCostPerConversation: 'Cost per conversation',
  metricTargetCostPerConversation: 'Target cost per conversation',
  metricLinkClicks: 'Link clicks',
  metricCostPerLinkClick: 'Cost per link click',
  metricTargetCostPerLinkClick: 'Target cost per link click',
  metricThruPlays: 'ThruPlays',
  metricCostPerThruPlay: 'Cost per ThruPlay',
  metricTargetCostPerThruPlay: 'Target cost per ThruPlay',
  metricEngagements: 'Engagements',
  metricCostPerEngagement: 'Cost per engagement',
  metricTargetCostPerEngagement: 'Target cost per engagement',
  metricConversions: 'Conversions',
  metricCostPerConversion: 'Cost per conversion',
  metricTargetCostPerConversion: 'Target cost per conversion',
  metricClicks: 'Clicks',
  metricCostPerClick: 'Cost per click',
  metricTargetCostPerClick: 'Target cost per click',
  dateRange: '{start} to {end}',
  weekOf: 'week of {range}',
  proposalSummary: '{parts} proposed',
  appliedSummary: '{parts} applied',
  noneApplied: 'none applied yet',
  proposalPause: '{count,plural,one {# pause} other {# pauses}}',
  proposalAdPause: '{count,plural,one {# ad pause} other {# ad pauses}}',
  proposalRestore: '{count,plural,one {# restore} other {# restores}}',
  proposalCreative: '{count,plural,one {# creative change} other {# creative changes}}',
  proposalVariation: '{count,plural,one {# winner variation} other {# winner variations}}',
  proposalExperiment: '{count,plural,one {# experiment} other {# experiments}}',
  proposalAudience: '{count,plural,one {# new audience} other {# new audiences}}',
  proposalSetting: '{count,plural,one {# setting change} other {# setting changes}}',
  proposalRecommendation: '{count,plural,one {# recommendation} other {# recommendations}}',
  proposalBudget: '{count,plural,one {# budget move} other {# budget moves}}',
  appliedStatus: '{count,plural,one {# status change} other {# status changes}}',
  anotherPlatform: 'another platform',
  crossReading: 'Reading spend and {result} across {platforms}…',
  crossUncovered:
    "Spend and {result} for this range aren't available for a portfolio on {platforms}. Pick 7 or 14 days.",
  crossUnavailable:
    "Spend and {result} for this range aren't available yet for a portfolio on {platforms}.",
  flightStarts: 'Flight starts {date}',
  flightEnded: 'Flight ended',
  flightAwaiting: 'Flight day {day,number} of {total,number} · awaiting the first cycle',
  paceOn: 'On pace',
  paceUnder: 'Under pace',
  paceOver: 'Over pace',
  flightProgress: '{pace} · day {day,number} of {total,number}',
  seeRecommend: 'See what Recommend would do',
  openManage: 'Open Manage',
  reviewPause: 'Review the pause',
  reviewBudget: 'Review the budget moves',
  openCreativeRecommendation: 'Open the creative recommendation',
  openAudienceProposal: 'Open the audience proposal',
  openAudienceRecommendation: 'Open the audience recommendation',
  moduleBudget: 'Budget',
  modulePause: 'Pausing',
  moduleCreative: 'Creatives',
  moduleAudience: 'Audience',
  impactLow: 'Low impact',
  impactMedium: 'Medium impact',
  impactHigh: 'High impact',
  dailyBudget: 'Budget moves this cycle',
  dailyPause: 'Pause',
  dailyCreative: 'New creatives',
  dailyRotation: 'Creative rotation',
  dailyAudience: 'New audience',
  dailyAudienceChange: 'Audience change',
  dailyTitle: '{action} · {entity}',
  headlineResult: '{count,plural,one {# {one}} other {# {many}}}',
  headlineNoSpend: '{results} in {days,plural,one {# day} other {# days}}, no spend.',
  headlineSpent: '{results} in {days,plural,one {# day} other {# days}} with {amount} spent.',
  headlineStatus: '{results} in {days,plural,one {# day} other {# days}} at {cost}{target}{prior}.',
  headlineNoTarget: ', no target set',
  headlineOnTarget: ', on the target of {amount}',
  headlineCompareTarget: ', {comparison} of {amount}',
  headlineOverTarget: '{percent} over the target',
  headlineUnderTarget: '{percent} under the target',
  headlineSamePrior: ' and the same cost as {period}',
  headlineDifferentPrior: ' and {comparison} than {period}',
  headlineCheaper: '{percent} cheaper',
  headlineDearer: '{percent} dearer',
  priorThree: 'the three days before',
  priorWeek: 'the week before',
  priorFortnight: 'the two weeks before',
  priorThreeShort: 'prior 3d',
  priorWeekShort: 'prior week',
  priorFortnightShort: 'prior 14d',
  noOpportunity: 'No open opportunities today: the optimizer has nothing to propose.',
  noOpportunityPlan:
    'No open opportunities today: the optimizer has nothing to propose and the portfolio keeps running at {amount} a day.',
  opportunityFloor:
    'No opportunity clears the floor today: the largest is worth {amount} a day against a floor of {floor}.',
  opportunityPauseCost:
    'The opportunity: {name} pays {cost} per {unit}; pausing it frees {amount} a day.',
  opportunityPause: 'The opportunity: pausing {name} frees {amount} a day.',
  opportunityBudget: 'The opportunity: move budget toward {name}, {amount} a day at stake.',
  opportunityCreative: 'The opportunity: refresh the creative on {name}, {amount} a day at stake.',
  opportunityAudience: 'The opportunity: open an audience next to {name}, {amount} a day at stake.',
  anAdSet: 'an ad set',
  anotherResult: 'another result',
  blockMismatchAll:
    'Blocked: {total,plural,one {the # ad set bids} other {all # ad sets bid}} for {bought}, not for {measured} as this portfolio measures; the optimizer holds them and moves nothing.',
  blockMismatchSome:
    'Blocked: {count,plural,one {# ad set of {total,number} bids} other {# ad sets of {total,number} bid}} for {bought}, not for {measured} as this portfolio measures; the optimizer holds them and moves only the rest.',
  blockZero: 'Blocked: zero delivery, nothing spent in {days,plural,one {# day} other {# days}}.',
  blockSignal:
    'Blocked: no signal, {amount} spent and 0 {results} in {days,plural,one {# day} other {# days}}; nothing to decide on.',
  automaticRead: 'Automatic read',
  readAttribution: '{who} · on {name}',
  readAttributionAgo: '{who} · on {name} · {ago}',
  tileSpendTitle: 'Spend · {days,plural,one {# day} other {# days}}',
  tileSpendPlan: '{amount} per day · plan {plan}',
  tileSpendNoPlan: '{amount} per day · no daily plan',
  tileDelta: '{percent} vs {period}',
  tileAtTarget: '{count,number,integer} at target for this spend',
  tileNoResults: '{amount} with no result',
  noPrior: 'no prior period',
  costPerUnit: 'Cost per {unit}',
  noResultsToDivide: 'no {results} to divide by',
  noPrice: 'no price yet',
  noTarget: 'no target',
  onAmountTarget: 'on the {amount} target',
  costTargetComparison: '{percent} {direction,select,over {over} other {under}} target {target}',
  decisions: 'Decisions',
  dailyAtStake: '{amount} per day at stake',
  awaitingDecision: 'Awaiting your decision',
  nothingWaiting: 'nothing waits for your decision',
  perUnit: 'per {unit}',
  targetAmount: 'target {amount}',
  onTarget: 'on target',
  noResults: 'no {results}',
  noResultsDays: 'no {results} in {days,plural,one {# day} other {# days}}',
  adsetsOnTarget: 'Ad sets on target',
  noneScored: 'no ad sets scored yet',
  bestCost: 'best {name} {amount}',
  worstCost: 'worst {name} {amount}',
  countOfTotal: '{count,number} of {total,number}',
  noMeasuredCost: 'no measured cost',
  tileDayPlan: '{amount}/day · {plan}',
  planAmount: 'plan {amount}',
  noDailyPlan: 'no daily plan',
  openOpportunities: '{count,plural,one {# open opportunity} other {# open opportunities}}',
  reviewArrow: 'Review →',
  nounPurchase: 'purchase',
  nounPurchases: 'purchases',
  nounInstall: 'install',
  nounInstalls: 'installs',
  nounSignup: 'sign-up',
  nounSignups: 'sign-ups',
  nounLead: 'lead',
  nounLeads: 'leads',
  nounLpv: 'landing page view',
  nounLpvs: 'landing page views',
  nounThousandImpressions: 'thousand impressions',
  nounConversation: 'conversation',
  nounConversations: 'conversations',
  nounLinkClick: 'link click',
  nounLinkClicks: 'link clicks',
  nounThruplay: 'ThruPlay',
  nounThruplays: 'ThruPlays',
  nounEngagement: 'engagement',
  nounEngagements: 'engagements',
  nounClick: 'click',
  nounClicks: 'clicks',
  triggerP1_zero_upper_funnel: 'no upper-funnel results',
  triggerP2_sustained_poor: 'sustained poor cost',
  triggerP3_low_significance: 'too few results to judge',
  triggerC1_creative_drag: 'a creative dragging results down',
  triggerC2_creative_winner: 'a winning creative',
  triggerC3_no_variance: 'too few creatives to compare',
  triggerC4_creative_decay: 'a creative wearing out',
  triggerC5_auction_displacement: 'a creative losing the auction',
  triggerF1_creative_fatigue: 'creative fatigue',
  triggerF2_audience_saturation: 'audience saturation',
  triggerF3_audience_exhausted: 'an exhausted audience',
  triggerD1_off_meta: 'paused or removed on Meta',
  triggerD2_dark_with_budget: 'no delivery despite budget',
  triggerD3_learning_limited: 'stuck in limited learning',
  triggerS1_velocity_cap_binding: 'the per-cycle change cap',
  triggerS2_floor_too_high: 'floors above the pool',
  triggerS3_persistent_underspend: 'persistent underspend',
  triggerS5_tracking_gap: 'a tracking gap',
  customRule: 'rule {name}',
  evidenceSpend: 'Spend',
  evidenceCost: 'Cost per result',
  evidenceFrequency: 'Frequency',
  evidenceReachGrowth: 'Reach growth',
  evidenceDays: '{count,plural,one {# day} other {# days}}',
  evidenceLine: '{metric} {value} {comparator} · {window}',
  atStake: '{amount} at stake',
  capBeyond:
    '{beyond,number} of {total,number} moves went past the ±{cap}% per-cycle cap: pacing (or keeping the pool whole) may exceed it, so the cap did not bind them. {held}',
  capHeldNone: 'The cap held none of them back.',
  capHeldOther:
    '{count,plural,one {The cap held # other move at ±{cap}%.} other {The cap held # other moves at ±{cap}%.}}',
  capComparator: '{beyond,number} of {total,number} moves past the ±{cap}% cap',
  capHeadline: 'of moves went past the cap',
  asOfOnly: 'As of {date}',
  asOfNext: 'As of {date} · next cycle {next}',
  asOfAttempt: 'As of {date} · next attempt {next}',
  settingThreshold: 'Autopilot hold threshold',
  settingDailyTotal: 'Daily total',
  settingFlightBudget: 'Flight budget',
  notSet: 'not set',
  evidenceReference: 'reference',
  evidenceSpendDay: 'spend per day',
  evidencePeople: 'people reached',
  evidenceCap: 'cap',
} as const;
export type OptimizerDisplayKey = keyof typeof OPTIMIZER_DISPLAY_EN;
export type OptimizerDisplayTranslate = (
  key: OptimizerDisplayKey,
  values?: Record<string, string | number>,
) => string;

export const OPTIMIZATION_METRIC_DISPLAY_KEYS = {
  purchase: {
    resultLabel: 'metricPurchases',
    costLabel: 'metricCPA',
    targetLabel: 'metricTargetCPA',
  },
  app_install: {
    resultLabel: 'metricInstalls',
    costLabel: 'metricCPI',
    targetLabel: 'metricTargetCPI',
  },
  signup: {
    resultLabel: 'metricSignUps',
    costLabel: 'metricCostPerSignUp',
    targetLabel: 'metricTargetCostPerSignUp',
  },
  lead: {
    resultLabel: 'metricLeads',
    costLabel: 'metricCPL',
    targetLabel: 'metricTargetCPL',
  },
  traffic: {
    resultLabel: 'metricLandingPageViews',
    costLabel: 'metricCostPerLPV',
    targetLabel: 'metricTargetCostPerLPV',
  },
  awareness: {
    resultLabel: 'metricImpressions',
    costLabel: 'metricCPM',
    targetLabel: 'metricTargetCPM',
  },
  conversations: {
    resultLabel: 'metricConversations',
    costLabel: 'metricCostPerConversation',
    targetLabel: 'metricTargetCostPerConversation',
  },
  link_clicks: {
    resultLabel: 'metricLinkClicks',
    costLabel: 'metricCostPerLinkClick',
    targetLabel: 'metricTargetCostPerLinkClick',
  },
  thruplays: {
    resultLabel: 'metricThruPlays',
    costLabel: 'metricCostPerThruPlay',
    targetLabel: 'metricTargetCostPerThruPlay',
  },
  post_engagement: {
    resultLabel: 'metricEngagements',
    costLabel: 'metricCostPerEngagement',
    targetLabel: 'metricTargetCostPerEngagement',
  },
  clicks: {
    resultLabel: 'metricClicks',
    costLabel: 'metricCostPerClick',
    targetLabel: 'metricTargetCostPerClick',
  },
  custom: {
    resultLabel: 'metricConversions',
    costLabel: 'metricCostPerConversion',
    targetLabel: 'metricTargetCostPerConversion',
  },
} as const;

/** Clone display fields only. Source descriptors and all scoring fields remain authoritative. */
export function localizeOptimizationMetricDefinition(
  definition: OptimizationMetricDefinition,
  translate?: OptimizerDisplayTranslate,
): OptimizationMetricDefinition {
  const canonical = getOptimizationMetricDefinition(definition.objective);
  const keys = OPTIMIZATION_METRIC_DISPLAY_KEYS[definition.objective];
  const result = { ...definition };
  if (translate)
    for (const field of ['resultLabel', 'costLabel', 'targetLabel'] as const) {
      if (definition[field] === canonical[field]) result[field] = translate(keys[field]);
    }
  return result;
}

export type OptimizerStaticDisplayKey = {
  [Key in OptimizerDisplayKey]: (typeof OPTIMIZER_DISPLAY_EN)[Key] extends `${string}{${string}`
    ? never
    : Key;
}[OptimizerDisplayKey];
export function optimizerDisplayCopy(
  key: OptimizerStaticDisplayKey,
  translate?: OptimizerDisplayTranslate,
): string {
  return translate ? translate(key) : OPTIMIZER_DISPLAY_EN[key];
}

/** Restore structured display slots after ICU selects their position; never parse authored text. */
export function optimizerDisplayParts<T>(
  translate: OptimizerDisplayTranslate,
  key: OptimizerDisplayKey,
  values: Record<string, string | number | T | readonly (string | T)[]>,
): Array<string | T> {
  let prefix = '\uFFF0slot';
  const strings = Object.values(values).filter(
    (value): value is string => typeof value === 'string',
  );
  while (strings.some((value) => value.includes(prefix))) prefix += '_';
  const slots = new Map<string, T | readonly (string | T)[]>();
  const args: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string' || typeof value === 'number') args[name] = value;
    else {
      const marker = `${prefix}${slots.size}\uFFF1`;
      slots.set(marker, value);
      args[name] = marker;
    }
  }
  const text = translate(key, args);
  if (!slots.size) return [text];
  return text.split(new RegExp(`(${[...slots.keys()].join('|')})`, 'g')).flatMap((part) => {
    const value = slots.get(part);
    if (value === undefined) return part ? [part] : [];
    return Array.isArray(value) ? [...value] : [value as T];
  });
}
