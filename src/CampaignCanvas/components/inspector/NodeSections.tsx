'use client';

import { useLocale, useTranslations } from 'next-intl';
import { localizedNodeOptions } from '../../types/nodeOptionPresentation';

/*
 * The campaign, ad set and ad editors. Each field writes through `updateNodeData`, the
 * same path the node's own context menu uses, so the inspector and the node can never
 * hold two answers for one field.
 */

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
  billingEventForGoal,
  CALL_TO_ACTIONS,
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

const AD_COPY_MAX = { primaryText: 2200, headline: 255, description: 255 } as const;

function useUpdate<T>(id: string) {
  const updateNodeData = useCampaignStore((store) => store.updateNodeData);
  return (patch: Partial<T>) => updateNodeData(id, patch as Record<string, unknown>);
}

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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const objectivesView = localizedNodeOptions(OBJECTIVES, uiText, uiLocale);
  const specialCategoriesView = localizedNodeOptions(SPECIAL_CATEGORIES, uiText, uiLocale);
  const { data } = node;
  const update = useUpdate<CampaignData>(node.id);
  const objectiveId = useFieldId('objective');

  return (
    <>
      <InspectorSection title={uiText('campaign_268286d')}>
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

      <InspectorSection title={uiText('special_ad_categories_37b459f')}>
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
      <InspectorSection title={uiText('ad_set_639a64f')}>
        <NameField id={node.id} label={data.label} />
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
                update({ budgetAmount: Math.round(amount * 100) / 100, budgetType: 'DAILY' });
              }}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
              {currency}
            </span>
          </div>
        </InspectorField>
      </InspectorSection>

      <InspectorSection title={uiText('delivery_52bfe58')}>
        <InspectorField label={uiText('optimization_goal_b5f886f')} htmlFor={ids.goal}>
          <SelectField
            id={ids.goal}
            testId="inspector-field-optimizationGoal"
            value={goal}
            options={optimizationGoalsView}
            onChange={(optimizationGoal) =>
              update({ optimizationGoal, billingEvent: billingEventForGoal(optimizationGoal) })
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
          label={uiText('bid_strategy_43f45e0')}
          hint={uiText('a_scaffold_builds_on_lowest_cost_change_the_b_e6e332b')}
        >
          <ReadOnlyValue testId="inspector-field-bidStrategy">
            {uiText('lowest_cost_c9d10bf')}
          </ReadOnlyValue>
        </InspectorField>
      </InspectorSection>

      <InspectorSection title={uiText('schedule_f4830a1')}>
        <p className="text-2xs leading-snug text-muted-foreground">
          {uiText('everything_deploys_paused_and_runs_from_the_m_da541ca')}
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
      <InspectorSection title={uiText('ad_1d97c9f')}>
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
      </InspectorSection>
    </>
  );
}
