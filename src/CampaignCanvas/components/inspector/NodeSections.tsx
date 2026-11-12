'use client';
import { useTranslations as useBetaTranslations, useLocale, useTranslations } from 'next-intl';
import { localizedNodeOptions } from '../../types/nodeOptionPresentation';

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
  InspectorField,
  InspectorSection,
  isHttpUrl,
  ReadOnlyValue,
  SelectField,
  useFieldId,
} from './fields';
import { isoToLocalInput, localInputToIso } from './localDateTime';

const AD_COPY_MAX = {
  primaryText: 2200,
  headline: 255,
  description: 255,
} as const;

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
  ...BID_STRATEGIES.map((strategy): [RegExp, string] => [
    new RegExp(`\\b${strategy.value}\\b`, 'g'),
    strategy.label,
  ]),
];

const inWords = (issue: string): string =>
  ISSUE_WORDS.reduce((text, [pattern, words]) => text.replace(pattern, words), issue);

/**
 * The rules this node breaks right now, named where they can be fixed. The contract's sentence
 * starts at the verb ("uses COST_CAP and needs …"), so the subject is this node; a sentence that
 * already names its field ("url_tags is …") stands on its own.
 */
function FieldIssues({ nodeId, noun }: { nodeId: string; noun: string }) {
  const betaUiText = useBetaTranslations('scale');

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
          {issue.startsWith('URL tags')
            ? issue
            : betaUiText('beta_710a6f0971b7', {
                value0: String(noun),
                value1: String(issue),
              })}
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
type BidPatch = Omit<BidValue, 'bidStrategy'> & {
  bidStrategy?: PaidScaffoldBidStrategy | null;
};

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
  const betaUiText = useBetaTranslations('scale');

  const id = useFieldId('bidStrategy');
  const strategy =
    BID_STRATEGIES.find((entry) => entry.value === value.bidStrategy)?.value ??
    'LOWEST_COST_WITHOUT_CAP';
  const description = BID_STRATEGIES.find((entry) => entry.value === strategy)?.description;
  return (
    <>
      <InspectorField label={betaUiText('beta_43f45e01f4b7')} htmlFor={id} hint={description}>
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
          label={
            strategy === 'COST_CAP'
              ? betaUiText('beta_8dd658e8f46f')
              : betaUiText('beta_aa3ac01f8eb0')
          }
          testId="inspector-field-bidAmount"
          value={value.bidAmount}
          suffix={currency}
          onCommit={(bidAmount) => onChange({ bidAmount })}
        />
      ) : null}
      {strategy === 'LOWEST_COST_WITH_MIN_ROAS' ? (
        <AmountField
          label={betaUiText('beta_d49be21c1c6b')}
          testId="inspector-field-roasFloor"
          value={value.roasFloor}
          suffix="x"
          hint={betaUiText('beta_4c638b1bcfad')}
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
const EVENT_OPTIONS = [
  { value: FROM_OBJECTIVE, label: 'From the objective' },
  ...CONVERSION_EVENTS,
];

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
  const uiText = useTranslations('scale');
  const fieldId = useFieldId('label');
  const update = useUpdate<{ label: string }>(id);
  const scaffoldBacked = useCampaignStore((store) => store.hydration !== null);
  if (!keptOnSave && scaffoldBacked) {
    return (
      <InspectorField
        label={uiText('name_dcd1d52')}
        hint={uiText('a_saved_version_does_not_keep_this_name_so_it_fb7955f')}
      >
        <p className="truncate text-sm text-foreground" data-testid="inspector-field-label-fixed">
          {label}
        </p>
      </InspectorField>
    );
  }
  return (
    <InspectorField label={uiText('name_dcd1d52')} htmlFor={fieldId}>
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
  const betaUiText = useBetaTranslations('scale');

  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const objectivesView = localizedNodeOptions(OBJECTIVES, uiText, uiLocale);
  const specialCategoriesView = localizedNodeOptions(SPECIAL_CATEGORIES, uiText, uiLocale);
  const { data } = node;
  const update = useUpdate<CampaignData>(node.id);
  const objectiveId = useFieldId('objective');
  const budgetMode = data.budgetMode ?? 'abo';
  const currency = data.budgetCurrency || 'USD';

  return (
    <>
      <FieldIssuesSlot nodeId={node.id} noun="campaign" />
      <InspectorSection title={betaUiText('beta_268286d2ef75')}>
        <NameField id={node.id} label={data.label} />
        <InspectorField label={uiText('objective_3b20adc')} htmlFor={objectiveId}>
          <SelectField<CampaignData['objective']>
            id={objectiveId}
            testId="inspector-field-objective"
            value={data.objective}
            options={objectivesView}
            onChange={(objective) => update({ objective })}
          />
        </InspectorField>
        <InspectorField
          label={uiText('buying_type_cf2c89b')}
          hint={uiText('every_scaffold_buys_its_delivery_at_auction_6c428e5')}
        >
          <ReadOnlyValue testId="inspector-field-buyingType">
            {uiText('auction_58d1546')}
          </ReadOnlyValue>
        </InspectorField>
      </InspectorSection>

      <InspectorSection title={betaUiText('beta_1c6225ec7092')}>
        <ChipGroup
          testId="inspector-field-budgetMode"
          label={betaUiText('beta_cbd4feef9179')}
          value={[budgetMode]}
          options={BUDGET_MODES}
          onChange={([mode]) => {
            if (mode && mode !== budgetMode) update({ budgetMode: mode });
          }}
        />
        {budgetMode === 'cbo' ? (
          <>
            <AmountField
              label={betaUiText('beta_6d17831bbb86')}
              testId="inspector-field-campaignBudgetAmount"
              value={data.campaignBudgetAmount}
              suffix={currency}
              hint={betaUiText('beta_f652deca72b3')}
              onCommit={(campaignBudgetAmount) => update({ campaignBudgetAmount })}
            />
            <BidFields value={data} currency={currency} onChange={update} />
          </>
        ) : (
          <p className="text-2xs leading-snug text-muted-foreground">
            {betaUiText('beta_591809b08975')}
          </p>
        )}
      </InspectorSection>

      <InspectorSection title={betaUiText('beta_37b459f0e96b')}>
        <InspectorField
          label={uiText('declared_categories_b9ed583')}
          hint={uiText('required_for_housing_employment_credit_and_po_763d8a8')}
        >
          <ChipGroup
            multiple
            testId="inspector-field-specialAdCategories"
            label={uiText('special_ad_categories_37b459f')}
            value={data.specialAdCategories ?? []}
            options={specialCategoriesView}
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
  const betaUiText = useBetaTranslations('scale');

  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const optimizationGoalsView = localizedNodeOptions(OPTIMIZATION_GOALS, uiText, uiLocale);
  const placementModesView = localizedNodeOptions(PLACEMENT_MODES, uiText, uiLocale);
  const publisherPlatformsView = localizedNodeOptions(PUBLISHER_PLATFORMS, uiText, uiLocale);
  const facebookPositionsView = localizedNodeOptions(FACEBOOK_POSITIONS, uiText, uiLocale);
  const instagramPositionsView = localizedNodeOptions(INSTAGRAM_POSITIONS, uiText, uiLocale);
  const devicePlatformsView = localizedNodeOptions(DEVICE_PLATFORMS, uiText, uiLocale);
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
      <InspectorSection title={betaUiText('beta_639a64f7a788')}>
        <NameField id={node.id} label={data.label} />
        {cbo ? (
          <InspectorField
            label={betaUiText('beta_7b0a1f03fc02')}
            hint={betaUiText('beta_4470920c280b')}
          >
            <ReadOnlyValue testId="inspector-field-budgetHeld">
              {betaUiText('beta_71162240fed9')}
            </ReadOnlyValue>
          </InspectorField>
        ) : (
          <InspectorField
            label={uiText('daily_budget_7b0a1f0')}
            htmlFor={ids.budget}
            hint={uiText('canvasBudgetHint', { currency })}
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
                  update({
                    budgetAmount: Math.round(amount * 100) / 100,
                    budgetType: 'DAILY',
                  });
                }}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
                {currency}
              </span>
            </div>
          </InspectorField>
        )}
      </InspectorSection>

      <InspectorSection title={uiText('delivery_52bfe58')}>
        <InspectorField label={uiText('optimization_goal_b5f886f')} htmlFor={ids.goal}>
          <SelectField
            id={ids.goal}
            testId="inspector-field-optimizationGoal"
            value={goal}
            options={optimizationGoalsView}
            onChange={(optimizationGoal) =>
              update({
                optimizationGoal,
                billingEvent: billingEventForGoal(optimizationGoal),
              })
            }
          />
        </InspectorField>
        <InspectorField
          label={uiText('billing_event_574dbe6')}
          hint={uiText('set_by_the_optimization_goal_meta_allows_one__1a8be9c')}
        >
          <ReadOnlyValue testId="inspector-field-billingEvent">
            {(data.billingEvent || billingEventForGoal(goal)) === 'THRUPLAY'
              ? uiText('optimizer_nounThruplay')
              : uiText('optimizer_metricImpressions')}
          </ReadOnlyValue>
        </InspectorField>
        <InspectorField
          label={betaUiText('beta_e58c5e6839dd')}
          htmlFor={eventId}
          hint={betaUiText('beta_349b63f42a43')}
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
          label={betaUiText('beta_5817280a2398')}
          htmlFor={pixelId}
          error={pixelInvalid ? betaUiText('beta_975a72a78f54') : null}
          hint={betaUiText('beta_a33b63f9bcd7')}
        >
          <CommitInput
            id={pixelId}
            testId="inspector-field-pixelId"
            inputMode="numeric"
            placeholder={betaUiText('beta_b1b408992e82')}
            value={data.pixelId ?? ''}
            invalid={pixelInvalid}
            onCommit={(next) => update({ pixelId: next.trim() || null })}
          />
        </InspectorField>
        {cbo ? (
          <>
            <InspectorField
              label={betaUiText('beta_43f45e01f4b7')}
              hint={betaUiText('beta_641b2971f5cf')}
            >
              <ReadOnlyValue testId="inspector-field-bidHeld">
                {bidStrategyLabel(campaign?.bidStrategy)}
              </ReadOnlyValue>
            </InspectorField>
            {isCapped(campaign?.bidStrategy) ? (
              <AmountField
                label={betaUiText('beta_fd1b6639ad01')}
                testId="inspector-field-bidAmount"
                value={data.bidAmount}
                suffix={currency}
                hint={betaUiText('beta_5fed6bf7679b')}
                onCommit={(bidAmount) => update({ bidAmount })}
              />
            ) : null}
          </>
        ) : (
          <BidFields value={data} currency={currency} onChange={update} />
        )}
      </InspectorSection>

      <InspectorSection title={betaUiText('beta_f4830a1dae29')}>
        <InspectorField
          label={betaUiText('beta_96dbedeca7df')}
          htmlFor={startId}
          hint={betaUiText('beta_dfb5267fa3af')}
        >
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
        <InspectorField
          label={betaUiText('beta_e98982c9f2ba')}
          htmlFor={endId}
          hint={betaUiText('beta_94c7db3d7c7a')}
        >
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
          {betaUiText('beta_6f4707896284')}
        </p>
      </InspectorSection>

      <InspectorSection title={uiText('placements_af9851e')}>
        <ChipGroup
          testId="inspector-field-placementMode"
          label={uiText('placement_mode_5d77799')}
          value={[placementMode]}
          options={placementModesView}
          onChange={([mode]) => {
            if (!mode || mode === placementMode) return;
            updatePlacement(
              mode === 'manual'
                ? {
                    placementMode: 'manual',
                    publisherPlatforms: ['facebook', 'instagram'],
                  }
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
            {uiText('meta_places_the_ads_wherever_they_perform_bes_91ef84c')}
          </p>
        ) : (
          <>
            <InspectorField
              label={uiText('platforms_ab9bd75')}
              error={platforms.length === 0 ? uiText('canvasOption_18') : null}
            >
              <ChipGroup
                multiple
                testId="inspector-field-publisherPlatforms"
                label={uiText('platforms_ab9bd75')}
                value={platforms}
                options={publisherPlatformsView}
                onChange={(publisherPlatforms) => updatePlacement({ publisherPlatforms })}
              />
            </InspectorField>
            {platforms.includes('facebook') ? (
              <InspectorField
                label={uiText('facebook_positions_46cb73a')}
                hint={uiText('none_selected_places_on_every_one_6f79c62')}
              >
                <ChipGroup
                  multiple
                  testId="inspector-field-facebookPositions"
                  label={uiText('facebook_positions_46cb73a')}
                  value={data.facebookPositions ?? []}
                  options={facebookPositionsView}
                  onChange={(facebookPositions) => updatePlacement({ facebookPositions })}
                />
              </InspectorField>
            ) : null}
            {platforms.includes('instagram') ? (
              <InspectorField
                label={uiText('instagram_positions_a9fc9a6')}
                hint={uiText('none_selected_places_on_every_one_6f79c62')}
              >
                <ChipGroup
                  multiple
                  testId="inspector-field-instagramPositions"
                  label={uiText('instagram_positions_a9fc9a6')}
                  value={data.instagramPositions ?? []}
                  options={instagramPositionsView}
                  onChange={(instagramPositions) => updatePlacement({ instagramPositions })}
                />
              </InspectorField>
            ) : null}
            <InspectorField
              label={uiText('devices_4ba5121')}
              hint={uiText('none_selected_delivers_to_both_e313e10')}
            >
              <ChipGroup
                multiple
                testId="inspector-field-devicePlatforms"
                label={uiText('devices_4ba5121')}
                value={data.devicePlatforms ?? []}
                options={devicePlatformsView}
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
  const betaUiText = useBetaTranslations('scale');

  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const adFormatsView = localizedNodeOptions(AD_FORMATS, uiText, uiLocale);
  const callToActionsView = localizedNodeOptions(CALL_TO_ACTIONS, uiText, uiLocale);
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
  const formatLabel = adFormatsView.find((format) => format.value === data.adFormat)?.label;
  const linkInvalid = Boolean(data.linkUrl) && !isHttpUrl(data.linkUrl ?? '');
  const optional = (value: string) => value.trim() || undefined;

  return (
    <>
      <FieldIssuesSlot nodeId={node.id} noun="ad" />
      <InspectorSection title={betaUiText('beta_1d97c9fec35a')}>
        <NameField id={node.id} label={data.label} />
        <InspectorField
          label={uiText('format_2f34366')}
          hint={
            hasCreative
              ? uiText('set_by_the_connected_creative_change_the_crea_829696c')
              : uiText('connect_a_creative_to_set_the_format_191b959')
          }
        >
          <ReadOnlyValue testId="inspector-field-adFormat">
            {hasCreative ? formatLabel : uiText('no_creative_yet_7c2ca6e')}
          </ReadOnlyValue>
        </InspectorField>
      </InspectorSection>

      <InspectorSection title={uiText('copy_e21f935')}>
        <InspectorField
          label={uiText('primary_text_ecf5b5b')}
          htmlFor={ids.primaryText}
          hint={`${data.primaryText?.length ?? 0} / ${AD_COPY_MAX.primaryText}`}
        >
          <CommitTextarea
            id={ids.primaryText}
            testId="inspector-field-primaryText"
            value={data.primaryText ?? ''}
            maxLength={AD_COPY_MAX.primaryText}
            placeholder={uiText('what_the_ad_says_above_the_creative_5ee1bb1')}
            onCommit={(next) => update({ primaryText: next.trim() })}
          />
        </InspectorField>
        <InspectorField label={uiText('headline_c5f5a4c')} htmlFor={ids.headline}>
          <CommitInput
            id={ids.headline}
            testId="inspector-field-headline"
            value={data.headline ?? ''}
            maxLength={AD_COPY_MAX.headline}
            placeholder={uiText('short_and_specific_5a02385')}
            onCommit={(next) => update({ headline: next.trim() })}
          />
        </InspectorField>
        <InspectorField
          label={uiText('description_526e008')}
          htmlFor={ids.description}
          hint={uiText('optional_shown_under_the_headline_on_some_pla_1d40b93')}
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

      <InspectorSection title={uiText('destination_293d404')}>
        <InspectorField label={uiText('call_to_action_c48cd23')} htmlFor={ids.cta}>
          <SelectField
            id={ids.cta}
            testId="inspector-field-callToAction"
            value={data.callToAction || 'LEARN_MORE'}
            options={callToActionsView}
            onChange={(callToAction) => update({ callToAction })}
          />
        </InspectorField>
        <InspectorField
          label={uiText('destination_url_007f7ef')}
          htmlFor={ids.link}
          error={linkInvalid ? uiText('enter_a_full_url_including_https_fe3e14d') : null}
          hint={uiText('where_the_ad_and_its_button_open_67fa033')}
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
          label={betaUiText('beta_1ff3616207da')}
          htmlFor={ids.urlTags}
          hint={betaUiText('beta_1da79113a8c5')}
        >
          <CommitInput
            id={ids.urlTags}
            testId="inspector-field-urlTags"
            maxLength={PAID_SCAFFOLD_URL_TAGS_MAX}
            placeholder={betaUiText('beta_b285979f818b')}
            value={data.urlTags ?? ''}
            onCommit={(next) => update({ urlTags: next.trim() || null })}
          />
        </InspectorField>
      </InspectorSection>
    </>
  );
}
