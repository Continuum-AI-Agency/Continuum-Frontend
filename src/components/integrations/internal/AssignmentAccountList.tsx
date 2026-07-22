'use client';

import { Lock, SearchX } from 'lucide-react';
import { PLATFORM_ICONS } from '@/components/settings/shell/platformIcons';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  type AssignmentRow,
  type AssignmentSection,
  filterSection,
  sectionToggleIds,
} from '@/lib/integrations/assignmentGroups';
import { cn } from '@/lib/utils';

type AssignmentAccountListProps = {
  sections: AssignmentSection[];
  query: string;
  selectedById: Record<string, boolean>;
  isSaving: boolean;
  isLocked: (id: string) => boolean;
  ownerCaption: (id: string) => string | null;
  onToggle: (id: string, checked: boolean) => void;
  onToggleMany: (ids: string[], checked: boolean) => void;
};

const PROVIDER_BAND_ICON = {
  Meta: PLATFORM_ICONS.facebook,
  Google: PLATFORM_ICONS.googleAds,
} as const;

const iconChipClass =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground';

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function AccountRow({
  row,
  checked,
  disabled,
  caption,
  onCheckedChange,
}: {
  row: AssignmentRow;
  checked: boolean;
  disabled: boolean;
  caption: string | null;
  onCheckedChange: (checked: boolean) => void;
}) {
  const Icon = row.iconPlatformKey ? PLATFORM_ICONS[row.iconPlatformKey] : null;
  const controlId = `assign-account-${safeId(row.assetPk)}`;
  return (
    <label
      htmlFor={controlId}
      title={`ID: ${row.externalId}`}
      className={cn(
        'flex min-h-10 items-center gap-3 rounded-md px-2 py-1.5 transition-colors',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-accent/40',
      )}
    >
      <Checkbox
        id={controlId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      {Icon ? (
        <span className={iconChipClass}>
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="block truncate text-sm font-medium text-foreground">{row.label}</span>
          {row.readOnly ? (
            <Badge
              variant="outline"
              className="shrink-0 text-2xs font-normal text-muted-foreground"
            >
              Read-only
            </Badge>
          ) : null}
        </span>
        {caption ? (
          <span className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden />
            {caption}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function AssignmentAccountList({
  sections,
  query,
  selectedById,
  isSaving,
  isLocked,
  ownerCaption,
  onToggle,
  onToggleMany,
}: AssignmentAccountListProps) {
  const trimmed = query.trim();

  const rendered: Array<{
    section: AssignmentSection;
    visibleRows: AssignmentRow[];
    toggleIds: string[];
    showBand: boolean;
  }> = [];

  let lastProvider: string | null | undefined;
  for (const section of sections) {
    const { visibleRows, titleMatched } = filterSection(section, query);
    if (trimmed && !titleMatched && visibleRows.length === 0) continue;

    const toggleIds = sectionToggleIds(section, visibleRows, !trimmed || titleMatched);
    const showBand = section.providerLabel != null && section.providerLabel !== lastProvider;
    lastProvider = section.providerLabel;
    rendered.push({ section, visibleRows, toggleIds, showBand });
  }

  if (rendered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">No accounts match &ldquo;{trimmed}&rdquo;.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rendered.map(({ section, visibleRows, toggleIds, showBand }) => {
        const selectedCount = toggleIds.reduce(
          (count, id) => (selectedById[id] === true ? count + 1 : count),
          0,
        );
        const total = toggleIds.length;
        const allSelected = total > 0 && selectedCount === total;
        const partiallySelected = selectedCount > 0 && selectedCount < total;
        const HeaderIcon = section.providerLabel ? null : PLATFORM_ICONS[section.iconPlatformKey];
        const BandIcon = showBand
          ? PROVIDER_BAND_ICON[section.providerLabel as keyof typeof PROVIDER_BAND_ICON]
          : null;
        const selectAllId = `assign-select-all-${safeId(section.key)}`;

        return (
          <div key={section.key} className="flex flex-col gap-1.5">
            {showBand ? (
              <div className="flex items-center gap-1.5 px-1 pt-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                {BandIcon ? <BandIcon className="h-3.5 w-3.5" /> : null}
                {section.providerLabel}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-border/60 bg-card/40">
              <label
                htmlFor={selectAllId}
                className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/30"
              >
                <Checkbox
                  id={selectAllId}
                  checked={partiallySelected ? 'indeterminate' : allSelected}
                  disabled={isSaving || total === 0}
                  onCheckedChange={(value) => onToggleMany(toggleIds, value === true)}
                />
                {HeaderIcon ? (
                  <span className={iconChipClass}>
                    <HeaderIcon className="h-4 w-4" />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {section.title}
                    </span>
                    {section.readOnly ? (
                      <Badge
                        variant="outline"
                        className="shrink-0 text-2xs font-normal text-muted-foreground"
                      >
                        Read-only
                      </Badge>
                    ) : null}
                  </span>
                  {section.subtitle ? (
                    <span className="block text-2xs text-muted-foreground">{section.subtitle}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {selectedCount}/{total}
                </span>
              </label>

              {visibleRows.length > 0 ? (
                <div className="space-y-0.5 border-t border-border/60 p-1">
                  {visibleRows.map((row) => (
                    <AccountRow
                      key={row.assetPk}
                      row={row}
                      checked={selectedById[row.selectionId] === true || isLocked(row.selectionId)}
                      disabled={isSaving || isLocked(row.selectionId)}
                      caption={ownerCaption(row.selectionId)}
                      onCheckedChange={(checked) => onToggle(row.selectionId, checked)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
