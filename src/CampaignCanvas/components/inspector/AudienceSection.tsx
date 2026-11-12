'use client';
import { useTranslations as useBetaTranslations, useLocale, useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';
import {
  countryList,
  countryName,
  localizedNodeOptions,
  localizeNodeOptionCopy,
} from '../../types/nodeOptionPresentation';

/*
 * An audience is exactly one of two things, and the switch says which: a PUBLISHED
 * audience group (its members already exist on Meta; its targeting is the group's, read
 * only here) or explicit broad targeting (countries, ages, genders). The broad bounds are
 * the ones the save enforces — ISO-2 countries 1..25, ages 18..65, min <= max — so an
 * edit made here cannot be refused for them later.
 */

import { paidScaffoldCopiedAudienceSaveIssue } from '@continuum/contracts';
import { useEffect, useState } from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { audienceDataFromGroup } from '@/lib/campaign-canvas/hydrate';
import {
  type AudienceGroupRead,
  fetchPublishedAudienceGroups,
} from '@/lib/paid-media/jaina-activity-client';
import { usePersonEdit } from '../../hooks/usePersonEdit';
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

const GENDER_CODES: Record<GenderChoice, number[]> = {
  all: [],
  male: [1],
  female: [2],
};

const describeAges = (data: AudienceData, anyAgeLabel: string): string => {
  if (data.ageMin === undefined && data.ageMax === undefined) return anyAgeLabel;
  const max = data.ageMax ?? AUDIENCE_AGE_MAX;
  return `${data.ageMin ?? AUDIENCE_AGE_MIN}–${max >= AUDIENCE_AGE_MAX ? `${max}+` : max}`;
};

type PublishedGroups =
  | { state: 'loading' }
  | { state: 'ready'; groups: AudienceGroupRead[] }
  | { state: 'error'; message: string };

function usePublishedGroups(brandId: string, enabled: boolean): PublishedGroups {
  const formatUiError = useUiErrorMessage();
  const [result, setResult] = useState<
    Exclude<PublishedGroups, { state: 'error' }> | { state: 'error'; cause: unknown }
  >({ state: 'loading' });

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
          cause: error,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, enabled]);

  return result.state === 'error'
    ? { state: 'error', message: formatUiError(result.cause) }
    : result;
}

function GroupSummary({ data }: { data: AudienceData }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const genders = localizedNodeOptions(GENDER_OPTIONS, uiText, uiLocale);
  const rows = [
    {
      id: 'members',
      label: uiText('members_1044a4c'),
      value: data.customAudiences?.length
        ? uiText('canvasAudienceCount', { count: data.customAudiences.length })
        : localizeNodeOptionCopy('None listed', uiText),
    },
    {
      id: 'countries',
      label: uiText('countries_8faf7ec'),
      value: data.locations.length
        ? countryList(data.locations, uiLocale)
        : localizeNodeOptionCopy('From the members', uiText),
    },
    {
      id: 'ages',
      label: localizeNodeOptionCopy('Ages', uiText),
      value: describeAges(data, localizeNodeOptionCopy('Any age', uiText)),
    },
    {
      id: 'genders',
      label: uiText('genders_4102939'),
      value:
        genders.find((option) => option.value === genderChoiceOf(data.genders))?.label ??
        uiText('all_a52ace4'),
    },
  ];
  return (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md bg-muted/50 px-3 py-2.5 text-xs"
      data-testid="inspector-audience-group-summary"
    >
      {rows.map(({ id, label, value }) => (
        <div key={id} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 truncate text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function GroupPicker({ node }: { node: CampaignCanvasNodeMap['audience'] }) {
  const uiText = useTranslations('scale');
  const { data } = node;
  const { activeBrandId } = useActiveBrandContext();
  // A person's edit: it relabels what it changes 'user_gave' (see usePersonEdit).
  const updateNodeData = usePersonEdit();
  const published = usePublishedGroups(activeBrandId, true);
  const pickerId = useFieldId('group');

  if (published.state === 'loading') {
    return (
      <InspectorField label={uiText('audience_group_8171c17')}>
        <Skeleton className="h-8 w-full rounded-md bg-muted/70" />
      </InspectorField>
    );
  }
  if (published.state === 'error') {
    return (
      <InspectorField label={uiText('audience_group_8171c17')} error={published.message}>
        <span className="sr-only">{uiText('unavailable_ca18449')}</span>
      </InspectorField>
    );
  }

  const { groups } = published;
  const current = data.audienceGroupId;
  const options = groups.map((group) => ({
    value: group.id,
    label: group.name,
  }));
  // A group this node already names but that is not (or no longer) published stays
  // visible, labelled, so the picker never silently shows a different group.
  if (current && !groups.some((group) => group.id === current)) {
    options.unshift({
      value: current,
      label: uiText('canvasGroupNotPublished', { name: data.label }),
    });
  }

  if (groups.length === 0 && !current) {
    return (
      <InspectorField label={uiText('audience_group_8171c17')}>
        <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs leading-snug text-muted-foreground">
          {uiText('no_published_audience_groups_yet_ask_jaina_to_e95657e')}
        </p>
      </InspectorField>
    );
  }

  return (
    <InspectorField
      label={uiText('audience_group_8171c17')}
      htmlFor={pickerId}
      hint={uiText('only_published_groups_are_listed_their_member_3732544')}
    >
      <SelectField
        id={pickerId}
        testId="inspector-audience-group-picker"
        value={current}
        placeholder={uiText('choose_a_published_group_06e5415')}
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const locations = localizedNodeOptions(LOCATIONS, uiText, uiLocale, true);
  const genderOptions = localizedNodeOptions(GENDER_OPTIONS, uiText, uiLocale);
  const { data } = node;
  // A person's edit: it relabels what it changes 'user_gave' (see usePersonEdit).
  const updateNodeData = usePersonEdit();
  const update = (patch: Partial<AudienceData>) => updateNodeData(node.id, patch);
  const ids = { min: useFieldId('ageMin'), max: useFieldId('ageMax') };

  const selected = data.locations.filter((code) => ISO_COUNTRY.test(code));
  const full = selected.length >= AUDIENCE_MAX_COUNTRIES;
  const known = new Set(LOCATIONS.map((location) => location.value));
  const options = [
    ...locations.map((location) => ({
      value: location.value,
      label: location.label,
      disabled: full && !selected.includes(location.value),
    })),
    // Countries a hydrated node carries that the short list does not name.
    ...selected
      .filter((code) => !known.has(code))
      .map((code) => ({ value: code, label: countryName(code, uiLocale) })),
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
        label={uiText('countries_8faf7ec')}
        error={selected.length === 0 ? uiText('canvasOption_17') : null}
        hint={
          full
            ? uiText('canvasMaxCountries', { count: AUDIENCE_MAX_COUNTRIES })
            : uiText('canvasSelectedCountries', { count: selected.length })
        }
      >
        <ChipGroup
          multiple
          testId="inspector-audience-countries"
          label={uiText('countries_8faf7ec')}
          value={selected}
          options={options}
          onChange={(locations) => update({ locations })}
        />
      </InspectorField>

      <div className="grid grid-cols-2 gap-2">
        <InspectorField label={uiText('age_from_12db358')} htmlFor={ids.min}>
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
        <InspectorField label={uiText('age_to_59f177e')} htmlFor={ids.max}>
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
        {uiText.rich('sentence_9539f407e0a9', {
          v0: AUDIENCE_AGE_MIN,
          v1: AUDIENCE_AGE_MAX,
          v2: AUDIENCE_AGE_MAX,
          v3: AUDIENCE_AGE_MAX,
        })}
      </p>

      <InspectorField label={uiText('genders_4102939')}>
        <ChipGroup
          testId="inspector-audience-genders"
          label={uiText('genders_4102939')}
          value={[genderChoiceOf(data.genders)]}
          options={genderOptions}
          onChange={([choice]) => update({ genders: GENDER_CODES[choice ?? 'all'] })}
        />
      </InspectorField>
    </>
  );
}

export function AudienceSection({ node }: { node: CampaignCanvasNodeMap['audience'] }) {
  const betaUiText = useBetaTranslations('scale');

  const uiText = useTranslations('scale');
  const { data } = node;
  // A person's edit: it relabels what it changes 'user_gave' (see usePersonEdit).
  const updateNodeData = usePersonEdit();
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

  // A campaign copy's targeting is a live ad set's, verbatim: the canvas has no field for it,
  // so it is shown, not edited (a save refuses it by name).
  if (mode === 'copied') {
    return (
      <InspectorSection title={betaUiText('beta_545c02357695')}>
        <p className="text-sm font-medium" data-testid="inspector-audience-copied">
          {data.label}
        </p>
        <p className="text-2xs leading-snug text-muted-foreground">
          {paidScaffoldCopiedAudienceSaveIssue(data.copiedFromAdSetName ?? data.label)}
        </p>
      </InspectorSection>
    );
  }

  return (
    <>
      <InspectorSection title={uiText('audience_545c023')}>
        <NameField id={node.id} label={data.label} keptOnSave={false} />
        <Tabs value={mode} onValueChange={(value) => switchMode(value as AudienceMode)}>
          <TabsList data-testid="inspector-audience-mode" className="w-full">
            <TabsTrigger value="group" className="text-xs">
              {uiText('published_group_db5004c')}
            </TabsTrigger>
            <TabsTrigger value="broad" className="text-xs">
              {uiText('broad_3d9c053')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </InspectorSection>

      <InspectorSection
        title={mode === 'group' ? uiText('group_34ca0e7') : uiText('targeting_dfa4ae5')}
      >
        {mode === 'group' ? (
          <>
            <GroupPicker node={node} />
            {data.audienceGroupVersionId ? <GroupSummary data={data} /> : null}
            <p className="text-2xs leading-snug text-muted-foreground">
              {uiText('targeting_comes_from_the_published_group_to_c_6d5f6c0')}
            </p>
          </>
        ) : (
          <BroadTargeting node={node} />
        )}
      </InspectorSection>
    </>
  );
}
