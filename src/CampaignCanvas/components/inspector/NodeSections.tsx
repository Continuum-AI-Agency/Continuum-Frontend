'use client';

/*
 * The campaign, ad set and ad editors. Each field writes through `updateNodeData`, the
 * same path the node's own context menu uses, so the inspector and the node can never
 * hold two answers for one field — by way of `usePersonEdit`, so every field a person
 * changes here is labelled 'user_gave' on the card that shows the version.
 *
 * Budget mode, bid, schedule, optimization event and URL tags follow the contract's rules
 * (`paidScaffoldFullFieldIssues`): a field that cannot apply under the current budget mode is
 * hidden rather than refused, and a rule that is broken is named under the fields, the same
 * sentence the save would refuse with.
 */

import {
  PAID_SCAFFOLD_CAPPED_BID_STRATEGIES,
  PAID_SCAFFOLD_URL_TAGS_MAX,
  type PaidScaffoldBidStrategy,
  type PaidScaffoldBudgetMode,
  type PaidScaffoldConversionEvent,
} from '@continuum/contracts';
import { useMemo } from 'react';
import { inlineFieldIssues } from '@/lib/campaign-canvas/saveVersion';
import { usePersonEdit } from '../../hooks/usePersonEdit';
import { useCampaignStore } from '../../stores/useCampaignStore';
import type {
  AdData,
  AdSetData,
  CampaignCanvasNodeMap,
  CampaignData,
  PlacementMode,
} from '../../types';
import {
  AD_FORMATS,
  BID_STRATEGIES,
  bidStrategyLabel,
  billingEventForGoal,
  CALL_TO_ACTIONS,
  CONVERSION_EVENTS,
  DEFAULT_OPTIMIZATION_GOAL,
  DEVICE_PLATFORMS,
  FACEBOOK_POSITIONS,
  INSTAGRAM_POSITIONS,
  OBJECTIVES,
  OPTIMIZATION_GOALS,
  PUBLISHER_PLATFORMS,
  placementLabels,
  SPECIAL_CATEGORIES,
} from '../../types/nodeOptions';
import {
  ChipGroup,
  CommitInput,
  CommitTextarea,
  humanizeEnum,
  InspectorField,
  InspectorSection,
  isHttpUrl,
  ReadOnlyValue,
  SelectField,
  useFieldId,
} from './fields';
import { isoToLocalInput, localInputToIso } from './localDateTime';

const AD_COPY_MAX = { primaryText: 2200, headline: 255, description: 255 } as const;

function useUpdate<T>(id: string) {
  const updateNodeData = usePersonEdit();
  return (patch: Partial<T>) => updateNodeData(id, patch as Record<string, unknown>);
}

/** The contract's key names, in the words the fields beside them use. */
const ISSUE_WORDS: [RegExp, string][] = [
  [/an end_time/g, 'an end date'],
  [/campaign_daily_budget_minor_units/g, 'a campaign daily budget'],
  [/bid_amount_minor_units/g, 'a bid amount'],
  [/roas_floor/g, 'a ROAS floor'],
  [/end_time/g, 'the end'],
  [/start_time/g, 'the start'],
  [/url_tags/g, 'URL tags'],
  ...BID_STRATEGIES.map(
    (strategy): [RegExp, string] => [new RegExp(`\\b${strategy.value}\\b`, 'g'), strategy.label],
  ),
];

const inWords = (issue: string): string =>
  ISSUE_WORDS.reduce((text, [pattern, words]) => text.replace(pattern, words), issue);

/**
 * The rules this node breaks right now, named where they can be fixed. The contract's sentence
 * starts at the verb ("uses COST_CAP and needs …"), so the subject is this node; a sentence that
 * already names its field ("url_tags is …") stands on its own.
 */
function FieldIssues({ nodeId, noun }: { nodeId: string; noun: string }) {
  const nodes = useCampaignStore((store) => store.nodes);
  const edges = useCampaignStore((store) => store.edges);
  const hydration = useCampaignStore((store) => store.hydration);
  const issues = useMemo(
    () => inlineFieldIssues({ nodeId, nodes, edges, hydration }).map(inWords),
    [nodeId, nodes, edges, hydration],
  );
  if (issues.length === 0) return null;
  return (
    <ul
      className="flex flex-col gap-1 rounded-md bg-destructive/5 px-3 py-2 text-2xs leading-snug text-destructive"
      data-testid="inspector-field-issues"
      role="alert"
    >
      {issues.map((issue) => (
        <li key={issue}>
          {issue.startsWith('URL tags') ? issue : `This ${noun} ${issue}`}
        </li>
      ))}
    </ul>
  );
}

/** The issue list as the first thing under the inspector header, padded like a section. */
function FieldIssuesSlot({ nodeId, noun }: { nodeId: string; noun: string }) {
  return (
    <div className="px-4 pt-3 empty:hidden">
      <FieldIssues nodeId={nodeId} noun={noun} />
    </div>
  );
}

/** The ad set's campaign — its budget mode decides which of the ad set's fields apply. */
function useCampaignOf(adSetId: string): CampaignData | null {
  return useCampaignStore((store) => {
    const campaignIds = new Set(
      store.edges.filter((edge) => edge.target === adSetId).map((edge) => edge.source),
    );
    const campaign = store.nodes.find(
      (entry) => entry.type === 'campaign' && campaignIds.has(entry.id),
    );
    return (campaign?.data as CampaignData | undefined) ?? null;
  });
}

const isCapped = (strategy: string | null | undefined): boolean =>
  PAID_SCAFFOLD_CAPPED_BID_STRATEGIES.includes(strategy as PaidScaffoldBidStrategy);

/**
 * An amount in the account currency. Blank clears it (null); anything that is not a
 * positive number is refused and the field shows the held value again.
 */
function AmountField({
  label,
  testId,
  value,
  suffix,
  hint,
  onCommit,
}: {
  label: string;
  testId: string;
  value: number | null | undefined;
  suffix: string;
  hint?: string;
  onCommit: (amount: number | null) => void;
}) {
  const id = useFieldId(testId);
  return (
    <InspectorField label={label} htmlFor={id} hint={hint}>
      <div className="relative">
        <CommitInput
          id={id}
          testId={testId}
          inputMode="decimal"
          value={typeof value === 'number' ? String(value) : ''}
          className="pr-14 tabular-nums"
          onCommit={(next) => {
            if (!next.trim()) {
              onCommit(null);
              return;
            }
            const amount = Number(next.replace(',', '.'));
            if (!Number.isFinite(amount) || amount <= 0) return false;
            onCommit(Math.round(amount * 100) / 100);
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
          {suffix}
        </span>
      </div>
    </InspectorField>
  );
}

type BidValue = {
  bidStrategy?: string | null;
  bidAmount?: number | null;
  roasFloor?: number | null;
};

/** What a bid edit writes: only strategies the contract names. */
type BidPatch = Omit<BidValue, 'bidStrategy'> & { bidStrategy?: PaidScaffoldBidStrategy | null };

/**
 * Strategy, then the one number it needs: an amount for a cap, a floor for a ROAS goal. A
 * switch clears the number the new strategy does not take — a hidden leftover would otherwise
 * be what the save refuses.
 */
function BidFields({
  value,
  currency,
  onChange,
}: {
  value: BidValue;
  currency: string;
  onChange: (patch: BidPatch) => void;
}) {
  const id = useFieldId('bidStrategy');
  const strategy =
    BID_STRATEGIES.find((entry) => entry.value === value.bidStrategy)?.value ??
    'LOWEST_COST_WITHOUT_CAP';
  const description = BID_STRATEGIES.find((entry) => entry.value === strategy)?.description;
  return (
    <>
      <InspectorField label="Bid strategy" htmlFor={id} hint={description}>
        <SelectField<PaidScaffoldBidStrategy>
          id={id}
          testId="inspector-field-bidStrategy"
          value={strategy}
          options={BID_STRATEGIES}
          onChange={(next) => {
            const patch: BidPatch = {
              bidStrategy: next === 'LOWEST_COST_WITHOUT_CAP' ? null : next,
            };
            if (!isCapped(next) && value.bidAmount != null) patch.bidAmount = null;
            if (next !== 'LOWEST_COST_WITH_MIN_ROAS' && value.roasFloor != null) {
              patch.roasFloor = null;
            }
            onChange(patch);
          }}
        />
      </InspectorField>
      {isCapped(strategy) ? (
        <AmountField
          label={strategy === 'COST_CAP' ? 'Cost per result goal' : 'Bid cap'}
          testId="inspector-field-bidAmount"
          value={value.bidAmount}
          suffix={currency}
          onCommit={(bidAmount) => onChange({ bidAmount })}
        />
      ) : null}
      {strategy === 'LOWEST_COST_WITH_MIN_ROAS' ? (
        <AmountField
          label="Minimum ROAS"
          testId="inspector-field-roasFloor"
          value={value.roasFloor}
          suffix="x"
          hint="The return every ad set must hold, 2.5 = 2.5x. Optimizes for conversion value."
          onCommit={(roasFloor) => onChange({ roasFloor })}
        />
      ) : null}
    </>
  );
}

const BUDGET_MODES: { value: PaidScaffoldBudgetMode; label: string }[] = [
  { value: 'abo', label: 'Ad set budgets (ABO)' },
  { value: 'cbo', label: 'Campaign budget (CBO)' },
];

const FROM_OBJECTIVE = 'FROM_OBJECTIVE';
const EVENT_OPTIONS = [{ value: FROM_OBJECTIVE, label: 'From the objective' }, ...CONVERSION_EVENTS];

/**
 * Every node's name. Blank is refused: a node with no name cannot be told apart.
 *
 * `keptOnSave={false}` names a node whose name the saved version does not carry (audiences,
 * creatives). On a saved scaffold it is shown, never edited — a rename there would vanish at save.
 */
export function NameField({
  id,
  label,
  keptOnSave = true,
}: {
  id: string;
  label: string;
  keptOnSave?: boolean;
}) {
  const fieldId = useFieldId('label');
  const update = useUpdate<{ label: string }>(id);
  const scaffoldBacked = useCampaignStore((store) => store.hydration !== null);
  if (!keptOnSave && scaffoldBacked) {
    return (
      <InspectorField label="Name" hint="A saved version does not keep this name, so it cannot be renamed here.">
        <p className="truncate text-sm text-foreground" data-testid="inspector-field-label-fixed">
          {label}
        </p>
      </InspectorField>
    );
  }
  return (
    <InspectorField label="Name" htmlFor={fieldId}>
      <CommitInput
        id={fieldId}
        testId="inspector-field-label"
        value={label}
        maxLength={400}
        onCommit={(next) => {
          const trimmed = next.trim();
          if (!trimmed) return false;
          update({ label: trimmed });
        }}
      />
    </InspectorField>
  );
}

export function CampaignSection({ node }: { node: CampaignCanvasNodeMap['campaign'] }) {
  const { data } = node;
  const update = useUpdate<CampaignData>(node.id);
  const objectiveId = useFieldId('objective');
  const budgetMode = data.budgetMode ?? 'abo';
  const currency = data.budgetCurrency || 'USD';

  return (
    <>
      <FieldIssuesSlot nodeId={node.id} noun="campaign" />
      <InspectorSection title="Campaign">
        <NameField id={node.id} label={data.label} />
        <InspectorField label="Objective" htmlFor={objectiveId}>
          <SelectField<CampaignData['objective']>
            id={objectiveId}
            testId="inspector-field-objective"
            value={data.objective}
            options={OBJECTIVES}
            onChange={(objective) => update({ objective })}
          />
        </InspectorField>
        <InspectorField label="Buying type" hint="Every scaffold buys its delivery at auction.">
          <ReadOnlyValue testId="inspector-field-buyingType">Auction</ReadOnlyValue>
        </InspectorField>
      </InspectorSection>

      <InspectorSection title="Budget">
        <ChipGroup
          testId="inspector-field-budgetMode"
          label="Budget mode"
          value={[budgetMode]}
          options={BUDGET_MODES}
          onChange={([mode]) => {
            if (mode && mode !== budgetMode) update({ budgetMode: mode });
          }}
        />
        {budgetMode === 'cbo' ? (
          <>
            <AmountField
              label="Campaign daily budget"
              testId="inspector-field-campaignBudgetAmount"
              value={data.campaignBudgetAmount}
              suffix={currency}
              hint="Meta spreads it across the ad sets. The Optimizer moves ABO budgets only."
              onCommit={(campaignBudgetAmount) => update({ campaignBudgetAmount })}
            />
            <BidFields value={data} currency={currency} onChange={update} />
          </>
        ) : (
          <p className="text-2xs leading-snug text-muted-foreground">
            Each ad set holds its own daily budget and bid strategy.
          </p>
        )}
      </InspectorSection>

      <InspectorSection title="Special ad categories">
        <InspectorField
          label="Declared categories"
          hint="Required for housing, employment, credit and political ads. Leave empty otherwise."
        >
          <ChipGroup
            multiple
            testId="inspector-field-specialAdCategories"
            label="Special ad categories"
            value={data.specialAdCategories ?? []}
            options={SPECIAL_CATEGORIES}
            onChange={(specialAdCategories) => update({ specialAdCategories })}
          />
        </InspectorField>
      </InspectorSection>
    </>
  );
}

const PLACEMENT_MODES: { value: PlacementMode; label: string }[] = [
  { value: 'advantage_plus', label: 'Advantage+' },
  { value: 'manual', label: 'Manual' },
];

export function AdSetSection({ node }: { node: CampaignCanvasNodeMap['ad-set'] }) {
  const { data } = node;
  const update = useUpdate<AdSetData>(node.id);
  const ids = {
    budget: useFieldId('budget'),
    goal: useFieldId('goal'),
  };
  const currency = data.budgetCurrency || 'USD';
  const goal = data.optimizationGoal || DEFAULT_OPTIMIZATION_GOAL;
  const campaign = useCampaignOf(node.id);
  const cbo = campaign?.budgetMode === 'cbo';
  const eventId = useFieldId('customEventType');
  const pixelId = useFieldId('pixelId');
  const startId = useFieldId('startTime');
  const endId = useFieldId('endTime');
  const pixelInvalid = Boolean(data.pixelId) && !/^\d{5,32}$/.test(data.pixelId ?? '');
  const placementMode = data.placementMode ?? 'advantage_plus';
  const platforms = data.publisherPlatforms ?? [];

  /** Placement fields move together, and the display labels follow them. */
  const updatePlacement = (patch: Partial<AdSetData>) => {
    const next = {
      placementMode,
      publisherPlatforms: platforms,
      facebookPositions: data.facebookPositions ?? [],
      instagramPositions: data.instagramPositions ?? [],
      devicePlatforms: data.devicePlatforms ?? [],
      ...patch,
    };
    // A position only means something on a platform the ad set still places on.
    if (!next.publisherPlatforms.includes('facebook')) next.facebookPositions = [];
    if (!next.publisherPlatforms.includes('instagram')) next.instagramPositions = [];
    update({ ...next, pacingType: placementLabels(next) });
  };

  return (
    <>
      <FieldIssuesSlot nodeId={node.id} noun="ad set" />
      <InspectorSection title="Ad set">
        <NameField id={node.id} label={data.label} />
        {cbo ? (
          <InspectorField label="Daily budget" hint="Set it on the campaign.">
            <ReadOnlyValue testId="inspector-field-budgetHeld">
              Held by the campaign — Campaign budget (CBO)
            </ReadOnlyValue>
          </InspectorField>
        ) : (
        <InspectorField
          label="Daily budget"
          htmlFor={ids.budget}
          hint={`Per day, in ${currency}. A figure below Meta's minimum is raised to it on save.`}
        >
          <div className="relative">
            <CommitInput
              id={ids.budget}
              testId="inspector-field-budgetAmount"
              inputMode="decimal"
              value={String(data.budgetAmount ?? 0)}
              className="pr-14 tabular-nums"
              onCommit={(next) => {
                const amount = Number(next.replace(',', '.'));
                if (!Number.isFinite(amount) || amount < 0) return false;
                update({ budgetAmount: Math.round(amount * 100) / 100, budgetType: 'DAILY' });
              }}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
              {currency}
            </span>
          </div>
        </InspectorField>
        )}
      </InspectorSection>

      <InspectorSection title="Delivery">
        <InspectorField label="Optimization goal" htmlFor={ids.goal}>
          <SelectField
            id={ids.goal}
            testId="inspector-field-optimizationGoal"
            value={goal}
            options={OPTIMIZATION_GOALS}
            onChange={(optimizationGoal) =>
              update({ optimizationGoal, billingEvent: billingEventForGoal(optimizationGoal) })
            }
          />
        </InspectorField>
        <InspectorField
          label="Billing event"
          hint="Set by the optimization goal. Meta allows one per goal."
        >
          <ReadOnlyValue testId="inspector-field-billingEvent">
            {humanizeEnum(data.billingEvent || billingEventForGoal(goal))}
          </ReadOnlyValue>
        </InspectorField>
        <InspectorField
          label="Optimization event"
          htmlFor={eventId}
          hint="The pixel event delivery optimizes for. From the objective: Purchase for sales, Lead for leads."
        >
          <SelectField<string>
            id={eventId}
            testId="inspector-field-customEventType"
            value={data.customEventType ?? FROM_OBJECTIVE}
            options={EVENT_OPTIONS}
            onChange={(next) =>
              update({
                customEventType:
                  next === FROM_OBJECTIVE ? null : (next as PaidScaffoldConversionEvent),
              })
            }
          />
        </InspectorField>
        <InspectorField
          label="Pixel"
          htmlFor={pixelId}
          error={pixelInvalid ? 'A Meta pixel id is 5 to 32 digits.' : null}
          hint="Optional. Empty uses the ad account's only pixel."
        >
          <CommitInput
            id={pixelId}
            testId="inspector-field-pixelId"
            inputMode="numeric"
            placeholder="Pixel id"
            value={data.pixelId ?? ''}
            invalid={pixelInvalid}
            onCommit={(next) => update({ pixelId: next.trim() || null })}
          />
        </InspectorField>
        {cbo ? (
          <>
            <InspectorField label="Bid strategy" hint="Set on the campaign, which holds the budget.">
              <ReadOnlyValue testId="inspector-field-bidHeld">
                {bidStrategyLabel(campaign?.bidStrategy)}
              </ReadOnlyValue>
            </InspectorField>
            {isCapped(campaign?.bidStrategy) ? (
              <AmountField
                label="This ad set's own cap"
                testId="inspector-field-bidAmount"
                value={data.bidAmount}
                suffix={currency}
                hint="Optional. Empty uses the campaign's."
                onCommit={(bidAmount) => update({ bidAmount })}
              />
            ) : null}
          </>
        ) : (
          <BidFields value={data} currency={currency} onChange={update} />
        )}
      </InspectorSection>

      <InspectorSection title="Schedule">
        <InspectorField label="Starts" htmlFor={startId} hint="Empty delivers as soon as you activate it.">
          <CommitInput
            id={startId}
            testId="inspector-field-startTime"
            type="datetime-local"
            value={isoToLocalInput(data.startTime)}
            onCommit={(next) => {
              const startTime = localInputToIso(next);
              if (next.trim() && !startTime) return false;
              update({ startTime: startTime ?? '' });
            }}
          />
        </InspectorField>
        <InspectorField label="Ends" htmlFor={endId} hint="Empty runs until you pause it.">
          <CommitInput
            id={endId}
            testId="inspector-field-endTime"
            type="datetime-local"
            value={isoToLocalInput(data.endTime)}
            onCommit={(next) => {
              const endTime = localInputToIso(next);
              if (next.trim() && !endTime) return false;
              update({ endTime: endTime ?? '' });
            }}
          />
        </InspectorField>
        <p className="text-2xs leading-snug text-muted-foreground">
          Everything still deploys paused: nothing delivers before you unpause it.
        </p>
      </InspectorSection>

      <InspectorSection title="Placements">
        <ChipGroup
          testId="inspector-field-placementMode"
          label="Placement mode"
          value={[placementMode]}
          options={PLACEMENT_MODES}
          onChange={([mode]) => {
            if (!mode || mode === placementMode) return;
            updatePlacement(
              mode === 'manual'
                ? { placementMode: 'manual', publisherPlatforms: ['facebook', 'instagram'] }
                : {
                    placementMode: 'advantage_plus',
                    publisherPlatforms: [],
                    facebookPositions: [],
                    instagramPositions: [],
                    devicePlatforms: [],
                  },
            );
          }}
        />
        {placementMode === 'advantage_plus' ? (
          <p className="text-2xs leading-snug text-muted-foreground">
            Meta places the ads wherever they perform best across its apps.
          </p>
        ) : (
          <>
            <InspectorField
              label="Platforms"
              error={platforms.length === 0 ? 'Pick at least one platform.' : null}
            >
              <ChipGroup
                multiple
                testId="inspector-field-publisherPlatforms"
                label="Platforms"
                value={platforms}
                options={PUBLISHER_PLATFORMS}
                onChange={(publisherPlatforms) => updatePlacement({ publisherPlatforms })}
              />
            </InspectorField>
            {platforms.includes('facebook') ? (
              <InspectorField label="Facebook positions" hint="None selected places on every one.">
                <ChipGroup
                  multiple
                  testId="inspector-field-facebookPositions"
                  label="Facebook positions"
                  value={data.facebookPositions ?? []}
                  options={FACEBOOK_POSITIONS}
                  onChange={(facebookPositions) => updatePlacement({ facebookPositions })}
                />
              </InspectorField>
            ) : null}
            {platforms.includes('instagram') ? (
              <InspectorField label="Instagram positions" hint="None selected places on every one.">
                <ChipGroup
                  multiple
                  testId="inspector-field-instagramPositions"
                  label="Instagram positions"
                  value={data.instagramPositions ?? []}
                  options={INSTAGRAM_POSITIONS}
                  onChange={(instagramPositions) => updatePlacement({ instagramPositions })}
                />
              </InspectorField>
            ) : null}
            <InspectorField label="Devices" hint="None selected delivers to both.">
              <ChipGroup
                multiple
                testId="inspector-field-devicePlatforms"
                label="Devices"
                value={data.devicePlatforms ?? []}
                options={DEVICE_PLATFORMS}
                onChange={(devicePlatforms) => updatePlacement({ devicePlatforms })}
              />
            </InspectorField>
          </>
        )}
      </InspectorSection>
    </>
  );
}

export function AdSection({ node }: { node: CampaignCanvasNodeMap['ad'] }) {
  const { data } = node;
  const update = useUpdate<AdData>(node.id);
  const ids = {
    primaryText: useFieldId('primaryText'),
    headline: useFieldId('headline'),
    description: useFieldId('description'),
    cta: useFieldId('cta'),
    link: useFieldId('link'),
    urlTags: useFieldId('urlTags'),
  };
  // The ad's format is its creative's: read it off the connected creative, not the ad.
  const hasCreative = useCampaignStore((store) => {
    const creativeIds = new Set(
      store.edges.filter((edge) => edge.source === node.id).map((edge) => edge.target),
    );
    return store.nodes.some((entry) => entry.type === 'creative' && creativeIds.has(entry.id));
  });
  const formatLabel = AD_FORMATS.find((format) => format.value === data.adFormat)?.label;
  const linkInvalid = Boolean(data.linkUrl) && !isHttpUrl(data.linkUrl ?? '');
  const optional = (value: string) => value.trim() || undefined;

  return (
    <>
      <FieldIssuesSlot nodeId={node.id} noun="ad" />
      <InspectorSection title="Ad">
        <NameField id={node.id} label={data.label} />
        <InspectorField
          label="Format"
          hint={
            hasCreative
              ? 'Set by the connected creative. Change the creative to change it.'
              : 'Connect a creative to set the format.'
          }
        >
          <ReadOnlyValue testId="inspector-field-adFormat">
            {hasCreative ? formatLabel : 'No creative yet'}
          </ReadOnlyValue>
        </InspectorField>
      </InspectorSection>

      <InspectorSection title="Copy">
        <InspectorField
          label="Primary text"
          htmlFor={ids.primaryText}
          hint={`${data.primaryText?.length ?? 0} / ${AD_COPY_MAX.primaryText}`}
        >
          <CommitTextarea
            id={ids.primaryText}
            testId="inspector-field-primaryText"
            value={data.primaryText ?? ''}
            maxLength={AD_COPY_MAX.primaryText}
            placeholder="What the ad says above the creative"
            onCommit={(next) => update({ primaryText: next.trim() })}
          />
        </InspectorField>
        <InspectorField label="Headline" htmlFor={ids.headline}>
          <CommitInput
            id={ids.headline}
            testId="inspector-field-headline"
            value={data.headline ?? ''}
            maxLength={AD_COPY_MAX.headline}
            placeholder="Short and specific"
            onCommit={(next) => update({ headline: next.trim() })}
          />
        </InspectorField>
        <InspectorField
          label="Description"
          htmlFor={ids.description}
          hint="Optional. Shown under the headline on some placements."
        >
          <CommitInput
            id={ids.description}
            testId="inspector-field-description"
            value={data.description ?? ''}
            maxLength={AD_COPY_MAX.description}
            onCommit={(next) => update({ description: optional(next) })}
          />
        </InspectorField>
      </InspectorSection>

      <InspectorSection title="Destination">
        <InspectorField label="Call to action" htmlFor={ids.cta}>
          <SelectField
            id={ids.cta}
            testId="inspector-field-callToAction"
            value={data.callToAction || 'LEARN_MORE'}
            options={CALL_TO_ACTIONS}
            onChange={(callToAction) => update({ callToAction })}
          />
        </InspectorField>
        <InspectorField
          label="Destination URL"
          htmlFor={ids.link}
          error={linkInvalid ? 'Enter a full URL, including https://' : null}
          hint="Where the ad and its button open."
        >
          <CommitInput
            id={ids.link}
            testId="inspector-field-linkUrl"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={data.linkUrl ?? ''}
            invalid={linkInvalid}
            onCommit={(next) => update({ linkUrl: optional(next) })}
          />
        </InspectorField>
        <InspectorField
          label="URL tags (UTM)"
          htmlFor={ids.urlTags}
          hint="Added to every click. Meta fills {{campaign.name}}, {{adset.name}} and {{ad.name}}."
        >
          <CommitInput
            id={ids.urlTags}
            testId="inspector-field-urlTags"
            maxLength={PAID_SCAFFOLD_URL_TAGS_MAX}
            placeholder="utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}"
            value={data.urlTags ?? ''}
            onCommit={(next) => update({ urlTags: next.trim() || null })}
          />
        </InspectorField>
      </InspectorSection>
    </>
  );
}
