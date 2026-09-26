'use client';

/*
 * An audience is exactly one of two things, and the switch says which: a PUBLISHED
 * audience group (its members already exist on Meta; its targeting is the group's, read
 * only here) or explicit broad targeting (countries, ages, genders). The broad bounds are
 * the ones the save enforces — ISO-2 countries 1..25, ages 18..65, min <= max — so an
 * edit made here cannot be refused for them later.
 */

import { useEffect, useState } from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { audienceDataFromGroup } from '@/lib/campaign-canvas/hydrate';
import {
  type AudienceGroupRead,
  fetchPublishedAudienceGroups,
} from '@/lib/paid-media/jaina-activity-client';
import { useCampaignStore } from '../../stores/useCampaignStore';
import type { AudienceData, AudienceMode, CampaignCanvasNodeMap } from '../../types';
import {
  AUDIENCE_AGE_MAX,
  AUDIENCE_AGE_MIN,
  AUDIENCE_MAX_COUNTRIES,
  LOCATIONS,
} from '../../types/nodeOptions';
import {
  ChipGroup,
  CommitInput,
  InspectorField,
  InspectorSection,
  SelectField,
  useFieldId,
} from './fields';
import { NameField } from './NodeSections';

const ISO_COUNTRY = /^[A-Z]{2}$/;

const clampAge = (age: number): number =>
  Math.min(AUDIENCE_AGE_MAX, Math.max(AUDIENCE_AGE_MIN, Math.round(age)));

type GenderChoice = 'all' | 'male' | 'female';

const GENDER_OPTIONS: { value: GenderChoice; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
];

const genderChoiceOf = (genders: number[] | undefined): GenderChoice =>
  genders?.length === 1 ? (genders[0] === 1 ? 'male' : 'female') : 'all';

const GENDER_CODES: Record<GenderChoice, number[]> = { all: [], male: [1], female: [2] };

const describeAges = (data: AudienceData): string => {
  if (data.ageMin === undefined && data.ageMax === undefined) return 'Any age';
  const max = data.ageMax ?? AUDIENCE_AGE_MAX;
  return `${data.ageMin ?? AUDIENCE_AGE_MIN}–${max >= AUDIENCE_AGE_MAX ? `${max}+` : max}`;
};

type PublishedGroups =
  | { state: 'loading' }
  | { state: 'ready'; groups: AudienceGroupRead[] }
  | { state: 'error'; message: string };

function usePublishedGroups(brandId: string, enabled: boolean): PublishedGroups {
  const [result, setResult] = useState<PublishedGroups>({ state: 'loading' });

  useEffect(() => {
    if (!enabled || !brandId) return;
    let cancelled = false;
    setResult({ state: 'loading' });
    fetchPublishedAudienceGroups({ brandId })
      .then((groups) => {
        if (!cancelled) setResult({ state: 'ready', groups });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({
          state: 'error',
          message: error instanceof Error ? error.message : 'Could not load audience groups.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, enabled]);

  return result;
}

function GroupSummary({ data }: { data: AudienceData }) {
  const rows: [string, string][] = [
    [
      'Members',
      data.customAudiences?.length
        ? `${data.customAudiences.length} ${data.customAudiences.length === 1 ? 'audience' : 'audiences'}`
        : 'None listed',
    ],
    ['Countries', data.locations.length ? data.locations.join(', ') : 'From the members'],
    ['Ages', describeAges(data)],
    [
      'Genders',
      GENDER_OPTIONS.find((option) => option.value === genderChoiceOf(data.genders))?.label ??
        'All',
    ],
  ];
  return (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md bg-muted/50 px-3 py-2.5 text-xs"
      data-testid="inspector-audience-group-summary"
    >
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="min-w-0 truncate text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function GroupPicker({ node }: { node: CampaignCanvasNodeMap['audience'] }) {
  const { data } = node;
  const { activeBrandId } = useActiveBrandContext();
  const updateNodeData = useCampaignStore((store) => store.updateNodeData);
  const published = usePublishedGroups(activeBrandId, true);
  const pickerId = useFieldId('group');

  if (published.state === 'loading') {
    return (
      <InspectorField label="Audience group">
        <Skeleton className="h-8 w-full rounded-md bg-muted/70" />
      </InspectorField>
    );
  }
  if (published.state === 'error') {
    return (
      <InspectorField label="Audience group" error={published.message}>
        <span className="sr-only">Unavailable</span>
      </InspectorField>
    );
  }

  const { groups } = published;
  const current = data.audienceGroupId;
  const options = groups.map((group) => ({ value: group.id, label: group.name }));
  // A group this node already names but that is not (or no longer) published stays
  // visible, labelled, so the picker never silently shows a different group.
  if (current && !groups.some((group) => group.id === current)) {
    options.unshift({ value: current, label: `${data.label} (not published)` });
  }

  if (groups.length === 0 && !current) {
    return (
      <InspectorField label="Audience group">
        <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs leading-snug text-muted-foreground">
          No published audience groups yet. Ask Jaina to build one, or switch to Broad targeting.
        </p>
      </InspectorField>
    );
  }

  return (
    <InspectorField
      label="Audience group"
      htmlFor={pickerId}
      hint="Only published groups are listed: their members already exist on Meta."
    >
      <SelectField
        id={pickerId}
        testId="inspector-audience-group-picker"
        value={current}
        placeholder="Choose a published group"
        options={options}
        onChange={(groupId) => {
          const group = groups.find((entry) => entry.id === groupId);
          if (group) updateNodeData(node.id, audienceDataFromGroup(group));
        }}
      />
    </InspectorField>
  );
}

function BroadTargeting({ node }: { node: CampaignCanvasNodeMap['audience'] }) {
  const { data } = node;
  const updateNodeData = useCampaignStore((store) => store.updateNodeData);
  const update = (patch: Partial<AudienceData>) => updateNodeData(node.id, patch);
  const ids = { min: useFieldId('ageMin'), max: useFieldId('ageMax') };

  const selected = data.locations.filter((code) => ISO_COUNTRY.test(code));
  const full = selected.length >= AUDIENCE_MAX_COUNTRIES;
  const known = new Set(LOCATIONS.map((location) => location.value));
  const options = [
    ...LOCATIONS.map((location) => ({
      value: location.value,
      label: location.label,
      disabled: full && !selected.includes(location.value),
    })),
    // Countries a hydrated node carries that the short list does not name.
    ...selected.filter((code) => !known.has(code)).map((code) => ({ value: code, label: code })),
  ];
  const ageMin = data.ageMin ?? AUDIENCE_AGE_MIN;
  const ageMax = data.ageMax ?? AUDIENCE_AGE_MAX;

  const commitAge = (bound: 'ageMin' | 'ageMax', raw: string) => {
    const parsed = Number(raw);
    if (!raw.trim() || !Number.isFinite(parsed)) return false;
    const age = clampAge(parsed);
    // The other bound moves with it rather than leaving a range Meta refuses.
    if (bound === 'ageMin') update({ ageMin: age, ageMax: Math.max(age, ageMax) });
    else update({ ageMax: age, ageMin: Math.min(age, ageMin) });
  };

  return (
    <>
      <InspectorField
        label="Countries"
        error={selected.length === 0 ? 'Pick at least one country.' : null}
        hint={
          full
            ? `${AUDIENCE_MAX_COUNTRIES} is the most one ad set can name.`
            : `${selected.length} selected`
        }
      >
        <ChipGroup
          multiple
          testId="inspector-audience-countries"
          label="Countries"
          value={selected}
          options={options}
          onChange={(locations) => update({ locations })}
        />
      </InspectorField>

      <div className="grid grid-cols-2 gap-2">
        <InspectorField label="Age from" htmlFor={ids.min}>
          <CommitInput
            id={ids.min}
            testId="inspector-audience-age-min"
            type="number"
            inputMode="numeric"
            min={AUDIENCE_AGE_MIN}
            max={AUDIENCE_AGE_MAX}
            value={String(ageMin)}
            className="tabular-nums"
            onCommit={(next) => commitAge('ageMin', next)}
          />
        </InspectorField>
        <InspectorField label="Age to" htmlFor={ids.max}>
          <CommitInput
            id={ids.max}
            testId="inspector-audience-age-max"
            type="number"
            inputMode="numeric"
            min={AUDIENCE_AGE_MIN}
            max={AUDIENCE_AGE_MAX}
            value={String(ageMax)}
            className="tabular-nums"
            onCommit={(next) => commitAge('ageMax', next)}
          />
        </InspectorField>
      </div>
      <p className="-mt-1.5 text-2xs leading-snug text-muted-foreground">
        {AUDIENCE_AGE_MIN} to {AUDIENCE_AGE_MAX}. {AUDIENCE_AGE_MAX} means {AUDIENCE_AGE_MAX} and
        older.
      </p>

      <InspectorField label="Genders">
        <ChipGroup
          testId="inspector-audience-genders"
          label="Genders"
          value={[genderChoiceOf(data.genders)]}
          options={GENDER_OPTIONS}
          onChange={([choice]) => update({ genders: GENDER_CODES[choice ?? 'all'] })}
        />
      </InspectorField>
    </>
  );
}

export function AudienceSection({ node }: { node: CampaignCanvasNodeMap['audience'] }) {
  const { data } = node;
  const updateNodeData = useCampaignStore((store) => store.updateNodeData);
  const mode: AudienceMode = data.mode ?? 'broad';

  const switchMode = (next: AudienceMode) => {
    if (next === mode) return;
    if (next === 'group') {
      updateNodeData(node.id, { mode: 'group' });
      return;
    }
    // Broad starts from what the group targeted, trimmed to what broad targeting allows;
    // the group's member audiences do not carry over — they are the group, not geography.
    updateNodeData(node.id, {
      mode: 'broad',
      audienceGroupId: undefined,
      audienceGroupVersionId: undefined,
      customAudiences: [],
      interests: [],
      behaviors: [],
      locations: data.locations
        .filter((code) => ISO_COUNTRY.test(code))
        .slice(0, AUDIENCE_MAX_COUNTRIES),
      ageMin: clampAge(data.ageMin ?? AUDIENCE_AGE_MIN),
      ageMax: clampAge(data.ageMax ?? AUDIENCE_AGE_MAX),
    });
  };

  return (
    <>
      <InspectorSection title="Audience">
        <NameField id={node.id} label={data.label} keptOnSave={false} />
        <Tabs value={mode} onValueChange={(value) => switchMode(value as AudienceMode)}>
          <TabsList data-testid="inspector-audience-mode" className="w-full">
            <TabsTrigger value="group" className="text-xs">
              Published group
            </TabsTrigger>
            <TabsTrigger value="broad" className="text-xs">
              Broad
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </InspectorSection>

      <InspectorSection title={mode === 'group' ? 'Group' : 'Targeting'}>
        {mode === 'group' ? (
          <>
            <GroupPicker node={node} />
            {data.audienceGroupVersionId ? <GroupSummary data={data} /> : null}
            <p className="text-2xs leading-snug text-muted-foreground">
              Targeting comes from the published group. To change it, publish a new version of the
              group.
            </p>
          </>
        ) : (
          <BroadTargeting node={node} />
        )}
      </InspectorSection>
    </>
  );
}
