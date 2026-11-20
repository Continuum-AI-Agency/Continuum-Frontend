'use client';

import { useFormatter, useLocale, useTranslations } from 'next-intl';

// Connecting the client's spreadsheet as the portfolio's attribution source (decisiones 20):
// pick a Google Sheet or upload a CSV, pick the tab, map the columns over a five-row preview —
// each dropdown prefilled from the service's header guess — and see the live match check
// before saving: "38 of 42 rows matched · 9 of 10 ad sets with spend covered (90%)", with the
// rows that matched nothing listed and the 80% bar said in plain words.

import type {
  SheetColumnRole,
  SheetDateFormat,
  SheetInspectResponse,
  SheetMatchKeyKind,
  SheetSyncReport,
} from '@continuum/contracts';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
import {
  attributionCopy,
  buildSheetConfig,
  COLUMN_ROLE_LABELS,
  clearsCoverageBar,
  coverageBarExplanation,
  DATE_FORMAT_LABELS,
  draftFromSuggestion,
  MATCH_KEY_KIND_LABELS,
  matchCheckLine,
  OPTIONAL_ROLES,
  REQUIRED_ROLES,
  type SheetLocation,
  type SheetMappingDraft,
  spreadsheetIdFrom,
} from './attributionModel';
import type { SheetAttributionApi } from './sheetAttributionApi';
import { useGoogleSheetPicker } from './useGoogleSheetPicker';

type Loaded = {
  location: SheetLocation;
  csv: string | null;
  inspect: SheetInspectResponse;
  label: string;
};

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ready'; report: SheetSyncReport }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

const UNAVAILABLE_LINE =
  "Reading spreadsheets isn't available yet. Your mapping is not lost — come back once it is.";

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function SourceStep({
  brandId,
  busy,
  onGoogleSheet,
  onCsv,
}: {
  brandId: string;
  busy: boolean;
  onGoogleSheet: (spreadsheetId: string, name: string) => void;
  onCsv: (file: File) => void;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const formatter = useFormatter();
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState(false);
  const picker = useGoogleSheetPicker(brandId, (sheet) =>
    onGoogleSheet(sheet.spreadsheetId, sheet.name),
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="sheet-source-step">
      <div className="space-y-2">
        <p className="font-medium text-xs">{uiText('connect_a_google_sheet_9fb533e')}</p>
        <Button
          disabled={busy || picker.opening}
          onClick={() => void picker.open()}
          size="sm"
          type="button"
          variant="secondary"
        >
          {uiText('choose_from_google_drive_65d0200')}
        </Button>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const id = spreadsheetIdFrom(link);
            if (!id) {
              setLinkError(true);
              return;
            }
            setLinkError(false);
            onGoogleSheet(id, 'Google Sheet');
          }}
        >
          <Input
            aria-label={uiText('google_sheet_link_cbdbecf')}
            className="h-8 text-xs"
            onChange={(event) => setLink(event.target.value)}
            placeholder={uiText('or_paste_the_sheet_link_bab801f')}
            value={link}
          />
          <Button disabled={busy || !link.trim()} size="sm" type="submit" variant="outline">
            {uiText('read_9b9a8d0')}
          </Button>
        </form>
        {linkError || picker.error ? (
          <p className="text-destructive text-xs" role="alert">
            {linkError
              ? attributionCopy('That is not a Google Sheets link.', uiText)
              : attributionCopy(
                  'The spreadsheet request could not be completed. Check the connection and try again.',
                  uiText,
                )}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <p className="font-medium text-xs">{uiText('upload_a_csv_5b9b0da')}</p>
        <p className="text-muted-foreground text-xs">
          {uiText('one_row_per_day_and_ad_set_or_campaign_with_a_93999ef')}
        </p>
        <Input
          accept=".csv,text/csv"
          aria-label={uiText('csv_file_73aad53')}
          className="h-8 text-xs"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onCsv(file);
          }}
          type="file"
        />
      </div>
    </div>
  );
}

function PreviewTable({ inspect }: { inspect: SheetInspectResponse }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const formatter = useFormatter();

  return (
    <div className="overflow-x-auto border-border/60 border-y">
      <table className="w-full text-xs" data-testid="sheet-preview">
        <thead>
          <tr className="bg-muted/40">
            {inspect.suggestion.headers.map((header, index) => (
              <th
                className="px-2 py-1 text-left font-medium"
                key={`${index}-${header}`}
                scope="col"
              >
                {header || uiText('template_2d10737ad394', { v0: index + 1 })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inspect.preview.map((row, rowIndex) => (
            <tr className="border-border/60 border-t" key={`row-${rowIndex}`}>
              {inspect.suggestion.headers.map((_, cellIndex) => (
                <td className="px-2 py-1 tabular-nums" key={`cell-${rowIndex}-${cellIndex}`}>
                  {row[cellIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="font-medium">{label}</span>
      <select
        aria-label={label}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MappingFields({
  inspect,
  draft,
  onChange,
}: {
  inspect: SheetInspectResponse;
  draft: SheetMappingDraft;
  onChange: (draft: SheetMappingDraft) => void;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const formatter = useFormatter();
  const columnOptions = inspect.suggestion.headers.map((header, index) => ({
    value: String(index),
    label: header || uiText('attributionColumn', { number: index + 1 }),
  }));
  const setColumn = (role: SheetColumnRole, value: string) =>
    onChange({
      ...draft,
      columns: { ...draft.columns, [role]: value === '' ? null : Number(value) },
    });
  const roleField = (role: SheetColumnRole, optional: boolean) => (
    <SelectField
      key={role}
      label={attributionCopy(COLUMN_ROLE_LABELS[role], uiText)}
      onChange={(value) => setColumn(role, value)}
      options={columnOptions}
      placeholder={optional ? uiText('not_in_this_sheet_198417f') : uiText('pick_a_column_cde1c47')}
      value={draft.columns[role] === null ? '' : String(draft.columns[role])}
    />
  );
  return (
    <div className="grid gap-2 sm:grid-cols-3" data-testid="sheet-mapping">
      {REQUIRED_ROLES.map((role) => roleField(role, false))}
      <SelectField
        label={uiText('that_column_holds_f69495e')}
        onChange={(value) =>
          onChange({ ...draft, matchKeyKind: value === '' ? null : (value as SheetMatchKeyKind) })
        }
        options={Object.entries(MATCH_KEY_KIND_LABELS).map(([value, label]) => ({
          value,
          label: attributionCopy(label, uiText),
        }))}
        placeholder={uiText('pick_what_it_holds_8f9c6b0')}
        value={draft.matchKeyKind ?? ''}
      />
      <SelectField
        label={uiText('date_format_43123f5')}
        onChange={(value) =>
          onChange({ ...draft, dateFormat: value === '' ? null : (value as SheetDateFormat) })
        }
        options={Object.entries(DATE_FORMAT_LABELS).map(([value, label]) => ({
          value,
          label: attributionCopy(label, uiText),
        }))}
        placeholder={uiText('pick_a_format_2938df9')}
        value={draft.dateFormat ?? ''}
      />
      {OPTIONAL_ROLES.map((role) => roleField(role, true))}
    </div>
  );
}

function MatchCheck({ state, kind }: { state: CheckState; kind: SheetMatchKeyKind | null }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const formatter = useFormatter();
  if (state.status === 'idle') return null;
  if (state.status === 'checking') {
    return (
      <p className="text-muted-foreground text-xs">
        {uiText('checking_the_rows_against_this_portfolio_3bfea60')}
      </p>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <p className="text-muted-foreground text-xs" data-testid="sheet-unavailable" role="status">
        {attributionCopy(UNAVAILABLE_LINE, uiText)}
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p className="text-destructive text-xs" role="alert">
        {attributionCopy(
          'The spreadsheet request could not be completed. Check the connection and try again.',
          uiText,
        )}
      </p>
    );
  }
  const { report } = state;
  const passes = clearsCoverageBar(report);
  return (
    <div className="space-y-1.5" data-testid="sheet-match-check">
      <p
        className={cn('font-medium text-xs', passes ? 'text-success' : 'text-warning')}
        data-testid="sheet-match-line"
      >
        {matchCheckLine(report, kind ?? 'adset_name', uiText, uiLocale)}
      </p>
      <p className="text-muted-foreground text-xs" data-testid="sheet-coverage-bar">
        {passes
          ? uiText('above_the_80_bar_this_sheet_will_be_used_e054e4a')
          : uiText('below_the_80_bar_each_platform_s_own_count_st_1dfd1b1')}{' '}
        {coverageBarExplanation(uiText, uiLocale)}
      </p>
      {report.rowsInvalid > 0 ? (
        <p className="text-muted-foreground text-xs">
          {uiText('attributionInvalidRows', {
            count: report.rowsInvalid,
            row: report.errors[0]?.row === undefined ? '—' : formatter.number(report.errors[0].row),
            guidance: attributionCopy(
              'Check the date, conversion count, and mapped columns for this row.',
              uiText,
            ),
          })}
        </p>
      ) : null}
      {report.unmatchedSamples.length > 0 ? (
        <div>
          <p className="font-medium text-xs">
            {uiText.rich('sentence_8d77882a160a', { v0: report.rowsUnmatched })}
          </p>
          <ul
            className="mt-1 space-y-0.5 text-muted-foreground text-xs"
            data-testid="sheet-unmatched"
          >
            {report.unmatchedSamples.map((sample) => (
              <li key={`${sample.row}-${sample.key}`}>
                {uiText.rich('sentence_9c5a3ac15d62', {
                  v0: sample.row,
                  v1: sample.key,
                  v2: sample.platform ? ` · ${PLATFORM_NAMES[sample.platform]}` : '',
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function SheetSetupFlow({
  brandId,
  portfolioId,
  api,
  onSaved,
  onCancel,
}: {
  brandId: string;
  portfolioId: string;
  api: SheetAttributionApi;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const formatter = useFormatter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<SheetMappingDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [check, setCheck] = useState<CheckState>({ status: 'idle' });
  const [saveError, setSaveError] = useState<
    { code: 'unavailable' } | { code: 'request'; diagnostic: string } | null
  >(null);

  async function inspect(location: SheetLocation, csv: string | null, label: string, tab?: string) {
    setBusy(true);
    setStepError(null);
    const outcome = await api.inspect(
      portfolioId,
      location.source === 'google_sheet'
        ? { source: 'google_sheet', spreadsheetId: location.spreadsheetId, ...(tab ? { tab } : {}) }
        : { source: 'csv_upload', csv: csv ?? '' },
    );
    setBusy(false);
    if (outcome.status === 'unavailable') {
      setUnavailable(true);
      return;
    }
    if (outcome.status === 'error') {
      setStepError(outcome.message);
      return;
    }
    const read = outcome.data;
    const resolved: SheetLocation =
      location.source === 'google_sheet' ? { ...location, tab: read.tab } : location;
    setLoaded({ location: resolved, csv, inspect: read, label });
    setDraft(draftFromSuggestion(read.suggestion, browserTimeZone()));
    setCheck({ status: 'idle' });
  }

  const build = useMemo(
    () => (loaded && draft ? buildSheetConfig(loaded.location, draft, uiText) : null),
    [loaded, draft, uiText],
  );
  const configKey = build?.ok ? JSON.stringify(build.config) : null;

  // The live match check: every complete mapping is checked as it is chosen, before any save.
  // biome-ignore lint/correctness/useExhaustiveDependencies: configKey is the config's identity
  useEffect(() => {
    if (!build?.ok || !loaded) return;
    let current = true;
    setCheck({ status: 'checking' });
    void api.check(portfolioId, build.config, loaded.csv).then((outcome) => {
      if (!current) return;
      if (outcome.status === 'ready') setCheck({ status: 'ready', report: outcome.data });
      else if (outcome.status === 'unavailable') setCheck({ status: 'unavailable' });
      else setCheck({ status: 'error', message: outcome.message });
    });
    return () => {
      current = false;
    };
  }, [configKey]);

  async function save() {
    if (!build?.ok || !loaded) return;
    setBusy(true);
    setSaveError(null);
    const outcome = await api.save(portfolioId, build.config, loaded.label);
    setBusy(false);
    if (outcome.status === 'ready') onSaved();
    else if (outcome.status === 'unavailable') setSaveError({ code: 'unavailable' });
    else setSaveError({ code: 'request', diagnostic: outcome.message });
  }

  if (unavailable) {
    return (
      <div className="space-y-2" data-testid="sheet-flow">
        <p className="text-muted-foreground text-xs" data-testid="sheet-unavailable" role="status">
          {attributionCopy(UNAVAILABLE_LINE, uiText)}
        </p>
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          {uiText('back_76900f1')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="sheet-flow">
      {!loaded ? (
        <SourceStep
          brandId={brandId}
          busy={busy}
          onCsv={(file) =>
            void file
              .text()
              .then((text) => inspect({ source: 'csv_upload' }, text, file.name))
              .catch((cause: unknown) =>
                setStepError(cause instanceof Error ? cause.message : 'csv_read_failed'),
              )
          }
          onGoogleSheet={(spreadsheetId, name) =>
            void inspect({ source: 'google_sheet', spreadsheetId, tab: null }, null, name)
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <p className="font-medium text-xs">{loaded.label}</p>
            {loaded.inspect.tabs.length > 1 && loaded.location.source === 'google_sheet' ? (
              <SelectField
                label={uiText('tab_90ddf19')}
                onChange={(tab) => {
                  if (loaded.location.source === 'google_sheet' && tab) {
                    void inspect({ ...loaded.location, tab }, null, loaded.label, tab);
                  }
                }}
                options={loaded.inspect.tabs.map((tab) => ({ value: tab, label: tab }))}
                placeholder={uiText('pick_a_tab_406ab6d')}
                value={loaded.inspect.tab ?? ''}
              />
            ) : null}
          </div>
          <PreviewTable inspect={loaded.inspect} />
          {draft ? (
            <MappingFields draft={draft} inspect={loaded.inspect} onChange={setDraft} />
          ) : null}
          {build && !build.ok ? (
            <p className="text-muted-foreground text-xs" data-testid="sheet-missing">
              {uiText.rich('sentence_814d6fb395e6', { v0: build.missing.join(', ') })}
            </p>
          ) : null}
          <MatchCheck kind={draft?.matchKeyKind ?? null} state={check} />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !build?.ok || check.status !== 'ready'}
              onClick={() => void save()}
              size="sm"
              type="button"
            >
              {uiText('use_this_sheet_5ef03b9')}
            </Button>
            <Button onClick={onCancel} size="sm" type="button" variant="ghost">
              {uiText('cancel_19766ed')}
            </Button>
          </div>
          {saveError ? (
            <p className="text-destructive text-xs" role="alert">
              {saveError.code === 'unavailable'
                ? attributionCopy("Saving a spreadsheet source isn't available yet.", uiText)
                : attributionCopy(
                    'The spreadsheet request could not be completed. Check the connection and try again.',
                    uiText,
                  )}
            </p>
          ) : null}
        </>
      )}
      {busy && !loaded ? (
        <p className="text-muted-foreground text-xs">{uiText('reading_the_sheet_e430a7f')}</p>
      ) : null}
      {stepError ? (
        <p className="text-destructive text-xs" role="alert">
          {attributionCopy(
            'The spreadsheet request could not be completed. Check the connection and try again.',
            uiText,
          )}
        </p>
      ) : null}
    </div>
  );
}
