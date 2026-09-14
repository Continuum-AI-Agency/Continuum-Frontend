'use client';

// Create / edit a project. Same shape as PromptForm — plain inputs, one save button, the
// error surfaced from the route rather than a generic failure — because the two sit two rows
// apart in the same settings nav and should not feel like different apps.

import { PROJECT_COLOR_PRESETS, type Project } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useProjectMutations } from '@/lib/projects/hooks';
import {
  type AdAccountOption,
  useAdAccountOptions,
  useCampaignOptions,
} from './ProjectScopePicker';

type Props = {
  brandId: string;
  /** null → create; a Project → edit it in place. */
  initial: Project | null;
  onCancelAction: () => void;
  onSavedAction: () => void;
};

function toggle(values: string[], id: string): string[] {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

/** A scrollable checkbox list. The bounded height carries its own scroll so a brand with 40
 *  ad accounts does not push the save button below the fold. */
function CheckboxList({
  label,
  options,
  selected,
  onToggleAction,
  emptyLabel,
  isLoading,
  isError,
}: {
  label: string;
  options: { id: string; name: string; hint?: string }[];
  selected: string[];
  onToggleAction: (id: string) => void;
  emptyLabel: string;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {selected.length > 0 ? ` · ${selected.length} selected` : ''}
      </p>
      <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background">
        {isLoading ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="px-2.5 py-2 text-sm text-destructive">
            Could not load {label.toLowerCase()}.
          </p>
        ) : options.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          options.map((option) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox renders the control.
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-muted/40"
            >
              <Checkbox
                checked={selected.includes(option.id)}
                onCheckedChange={() => onToggleAction(option.id)}
              />
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {option.hint ? (
                <span className="shrink-0 text-xs text-muted-foreground">{option.hint}</span>
              ) : null}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export function ProjectForm({ brandId, initial, onCancelAction, onSavedAction }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [brief, setBrief] = useState(initial?.brief ?? '');
  const [color, setColor] = useState<string>(initial?.color ?? PROJECT_COLOR_PRESETS[0]);
  const [adAccountIds, setAdAccountIds] = useState<string[]>(initial?.adAccountIds ?? []);
  const [campaignIds, setCampaignIds] = useState<string[]>(initial?.campaignIds ?? []);
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? '');
  const [error, setError] = useState<string | null>(null);

  const accounts = useAdAccountOptions(brandId);
  const selectedAccounts: AdAccountOption[] = accounts.items.filter((account) =>
    adAccountIds.includes(account.id),
  );
  const campaigns = useCampaignOptions(brandId, selectedAccounts);
  const { create, update } = useProjectMutations(brandId);

  const saving = create.isPending || update.isPending;
  const canSave = name.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setError(null);
    const payload = {
      name: name.trim(),
      brief: brief.trim() || null,
      color,
      adAccountIds,
      campaignIds,
      startsOn: startsOn || null,
      endsOn: endsOn || null,
    };
    try {
      if (initial) {
        await update.mutateAsync({ projectId: initial.id, ...payload });
      } else {
        await create.mutateAsync(payload);
      }
      onSavedAction();
    } catch (err) {
      // The route answers a duplicate name with a real 409 and the client surfaces its
      // message, so say the useful thing rather than a generic failure.
      setError(err instanceof Error ? err.message : 'Could not save the project.');
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-2.5">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Project name — e.g. UGC focus"
        maxLength={120}
        aria-label="Project name"
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium"
      />

      <textarea
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        rows={4}
        placeholder="The brief: the direction, tone and guardrails your agents read when this project is selected."
        aria-label="Project brief"
        className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm leading-relaxed"
      />

      <div className="flex flex-col gap-1.5">
        <p className="px-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Colour
        </p>
        <div className="flex flex-wrap gap-2">
          {PROJECT_COLOR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`Use colour ${preset}`}
              aria-pressed={color === preset}
              onClick={() => setColor(preset)}
              style={{ backgroundColor: preset }}
              className={
                color === preset
                  ? 'size-6 rounded-full ring-2 ring-foreground ring-offset-2 ring-offset-background'
                  : 'size-6 rounded-full opacity-70 hover:opacity-100'
              }
            />
          ))}
        </div>
      </div>

      {/* Native date inputs: the platform already ships a picker, a calendar, keyboard entry
          and localisation, and it emits exactly the YYYY-MM-DD the column stores. */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Starts
          <input
            type="date"
            value={startsOn}
            max={endsOn || undefined}
            onChange={(event) => setStartsOn(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Ends
          <input
            type="date"
            value={endsOn}
            min={startsOn || undefined}
            onChange={(event) => setEndsOn(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>
        <p className="max-w-sm text-xs text-muted-foreground">
          Optional. After the end date the project stays selectable and its assets stay scoped, but
          the agent stops being told the brief — a brief written for a finished campaign is not old
          advice, it is the wrong advice.
        </p>
      </div>

      <CheckboxList
        label="Ad accounts"
        options={accounts.items.map((account) => ({
          id: account.id,
          name: account.name,
          hint: account.platformLabel,
        }))}
        selected={adAccountIds}
        onToggleAction={(id) => setAdAccountIds((current) => toggle(current, id))}
        emptyLabel="No ad accounts assigned to this brand yet."
        isLoading={accounts.isLoading}
        isError={accounts.isError}
      />

      <CheckboxList
        label="Campaigns"
        options={campaigns.items.map((campaign) => ({ id: campaign.id, name: campaign.name }))}
        selected={campaignIds}
        onToggleAction={(id) => setCampaignIds((current) => toggle(current, id))}
        emptyLabel={
          selectedAccounts.length === 0
            ? 'Select an ad account to list its campaigns.'
            : 'No campaigns on the selected ad accounts.'
        }
        isLoading={selectedAccounts.length > 0 && campaigns.isLoading}
        isError={campaigns.isError}
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="mt-0.5 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancelAction}>
          Cancel
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={!canSave}
          aria-busy={saving || undefined}
          onClick={save}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {initial ? 'Save changes' : 'Create project'}
        </Button>
      </div>
    </div>
  );
}
