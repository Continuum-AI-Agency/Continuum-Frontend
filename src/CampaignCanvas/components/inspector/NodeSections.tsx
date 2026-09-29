'use client';

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
  humanizeEnum,
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

  return (
    <>
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
      <InspectorSection title="Ad set">
        <NameField id={node.id} label={data.label} />
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
          label="Bid strategy"
          hint="A scaffold builds on lowest cost. Change the bid after deploy, on the live ad set."
        >
          <ReadOnlyValue testId="inspector-field-bidStrategy">Lowest cost</ReadOnlyValue>
        </InspectorField>
      </InspectorSection>

      <InspectorSection title="Schedule">
        <p className="text-2xs leading-snug text-muted-foreground">
          Everything deploys paused and runs from the moment you unpause it, until you pause it
          again — there is no start or end date to set here.
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
      </InspectorSection>
    </>
  );
}
