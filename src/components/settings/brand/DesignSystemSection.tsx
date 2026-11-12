'use client';
import { useTranslations } from 'next-intl';

// The design-system editor: one card per section.
//
// Card-per-section rather than one document editor, because the sections are what the
// Studio compiler switches on and off and what MCP reads by name — editing them as one
// blob would make "turn off the voice rules for this campaign" impossible to express.
// It also means a correction to the palette does not put the typography rules at risk
// of a concurrent overwrite.
//
// Every save stamps `edited_at` server-side, which is what protects the card from the
// next re-import. That is the single most important behaviour here: a brand that fixes
// our reading and then re-uploads must not lose the fix.

import type { DesignSection, DesignSystemSnapshot } from '@continuum/contracts';
import { DESIGN_SECTION_LABELS } from '@continuum/contracts';
import { AlertTriangle, Check, Download, Pencil, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { DesignSystemCard } from '@/components/design-system/DesignSystemCard';
import { useDesignSystem } from '@/components/design-system/useDesignSystem';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  acknowledgeConflict,
  saveDesignSection,
  saveRigorOverride,
} from '@/lib/brands/designSystem.client';
import { downloadDesignSystemBundle } from '@/lib/brands/designSystemExport';
import { BrandEnginePanels } from './BrandEnginePanels';

export interface DesignSystemSectionProps {
  brandId: string;
}

export function DesignSystemSection({ brandId }: DesignSystemSectionProps) {
  const state = useDesignSystem(brandId);
  const snapshot = state.snapshot;

  return (
    <div className="space-y-6">
      <DesignSystemCard brandId={brandId} variant="settings" />

      {snapshot ? (
        <>
          <ConflictBar brandId={brandId} snapshot={snapshot} onResolved={state.refresh} />
          <RigorControl brandId={brandId} snapshot={snapshot} onChanged={state.refresh} />
          {/* Read before edit. The panels are what the engine will actually do with this
              system; the cards below are where it is corrected. */}
          <BrandEnginePanels snapshot={snapshot} fontsInStore={state.fontsInStore} />
          <div className="grid gap-4 md:grid-cols-2">
            {snapshot.sections.map((section) => (
              <SectionCard
                key={section.section}
                brandId={brandId}
                section={section}
                onSaved={state.refresh}
              />
            ))}
          </div>
          <ExportRow snapshot={snapshot} />
        </>
      ) : null}
    </div>
  );
}

/**
 * The warning bar.
 *
 * Shows disagreements the design system won, with both values named. A brand that
 * notices its site colour has stopped appearing should be able to find out why here
 * rather than concluding the platform is broken.
 */
function ConflictBar({
  brandId,
  snapshot,
  onResolved,
}: {
  brandId: string;
  snapshot: DesignSystemSnapshot;
  onResolved: () => Promise<void>;
}) {
  const tUi = useTranslations('settings');

  const unresolved = useMemo(
    () =>
      snapshot.conflicts
        .map((conflict, index) => ({ conflict, index }))
        .filter((entry) => entry.conflict.acknowledgedAt === null),
    [snapshot.conflicts],
  );
  if (unresolved.length === 0) return null;

  return (
    <div className="space-y-2">
      {unresolved.map(({ conflict, index }) => (
        <div
          key={`${conflict.section}-${conflict.field}-${index}`}
          className="flex items-start justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {DESIGN_SECTION_LABELS[conflict.section]} · {conflict.field}
              </p>
              <p className="mt-0.5 text-secondary">{conflict.detail}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await acknowledgeConflict(brandId, index);
              await onResolved();
            }}
          >
            {tUi('m_5b8027fa0e')}
          </Button>
        </div>
      ))}
    </div>
  );
}

const TIERS = ['strict', 'guided', 'loose'] as const;
const TIER_LABELS = {
  strict: 'Lock',
  guided: 'Guide',
  loose: 'Explore',
} as const;

/**
 * The rigor control.
 *
 * The tier is computed, and the evidence is shown next to it, so overriding is an
 * informed decision rather than a blind dial. A brand with a rich system that still
 * wants loose application is making a legitimate choice; a brand that cannot see why
 * we called it strict is just being told what to do.
 */
function RigorControl({
  brandId,
  snapshot,
  onChanged,
}: {
  brandId: string;
  snapshot: DesignSystemSnapshot;
  onChanged: () => Promise<void>;
}) {
  const tUi = useTranslations('settings');

  const [saving, setSaving] = useState(false);
  const active = snapshot.rigor.override ?? snapshot.rigor.tier;
  const evidence = snapshot.rigor.evidence;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{tUi('m_c1b9470f5f')}</p>
          <p className="mt-0.5 text-xs text-secondary">
            {tUi('m_c9667eaa05')}
            <span className="font-medium">{TIER_LABELS[snapshot.rigor.tier]}</span>{' '}
            {tUi('m_585af9b232')}
            {evidence.tokenCount}
            {tUi('m_db835814b2')}
            {evidence.hasAdherenceConfig ? tUi('m_15f0eab647') : ''}
            {evidence.imperativeRuleCount > 0
              ? tUi('m_9908afb590', {
                  v0: String(evidence.imperativeRuleCount),
                })
              : ''}
            .
          </p>
        </div>
        <div className="flex gap-1">
          {TIERS.map((tier) => (
            <Button
              key={tier}
              size="sm"
              variant={active === tier ? 'default' : 'outline'}
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  // Choosing the computed tier clears the override rather than pinning
                  // it, so a later re-import that changes the evidence is still free to
                  // move the tier.
                  await saveRigorOverride(brandId, tier === snapshot.rigor.tier ? null : tier);
                  await onChanged();
                } finally {
                  setSaving(false);
                }
              }}
            >
              {TIER_LABELS[tier]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

type SectionData = DesignSystemSnapshot['sections'][number];

function SectionCard({
  brandId,
  section,
  onSaved,
}: {
  brandId: string;
  section: SectionData;
  onSaved: () => Promise<void>;
}) {
  const tUi = useTranslations('settings');

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => section.rules.map((rule) => rule.statement).join('\n'));
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const statements = draft
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      await saveDesignSection({
        brandId,
        section: section.section as DesignSection,
        rules: statements.map((statement, index) => ({
          statement,
          // Strength is preserved positionally where it can be, so editing the wording
          // of a hard rule does not silently demote it to a preference.
          strength: section.rules[index]?.strength ?? 'preferred',
          target: section.rules[index]?.target ?? null,
          value: section.rules[index]?.value ?? null,
          sourceRef: section.rules[index]?.sourceRef ?? null,
        })),
      });
      await onSaved();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [brandId, draft, onSaved, section]);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={section.provenance === 'declared' ? 'default' : 'secondary'}>
              {section.provenance === 'declared'
                ? tUi('m_1bc3af8497')
                : section.provenance === 'edited'
                  ? tUi('m_fcf046611b')
                  : tUi('m_cd3297b914')}
            </Badge>
            {section.provenance === 'inferred' ? (
              <span className="text-xs text-secondary">
                {Math.round(section.confidence * 100)}
                {tUi('m_a89b4754f3')}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={section.enabled}
            aria-label={tUi('m_dbc7474bc6', { v0: String(section.title) })}
            onCheckedChange={async (checked) => {
              await saveDesignSection({
                brandId,
                section: section.section as DesignSection,
                enabled: checked,
              });
              await onSaved();
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              editing ? tUi('m_26bbc04fc4') : tUi('m_a9abc6a7cc', { v0: String(section.title) })
            }
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? <X className="size-4" /> : <Pencil className="size-4" />}
          </Button>
        </div>
      </div>

      {section.summary ? <p className="mt-2 text-sm text-secondary">{section.summary}</p> : null}

      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={6}
            aria-label={tUi('m_b599f0f79b', { v0: String(section.title) })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {tUi('m_77dfd2135f')}
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              <Check className="size-4" />
              {saving ? tUi('m_56a2285c5b') : tUi('m_efc007a393')}
            </Button>
          </div>
        </div>
      ) : section.rules.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {section.rules.slice(0, 6).map((rule) => (
            <li key={rule.statement} className="flex gap-2 text-sm">
              <span
                className={
                  rule.strength === 'hard'
                    ? 'shrink-0 font-medium text-foreground'
                    : 'shrink-0 text-secondary'
                }
              >
                {rule.strength === 'hard' ? tUi('m_ea641fd719') : tUi('m_13f66243ef')}
              </span>
              <span className="text-secondary">{rule.statement}</span>
            </li>
          ))}
          {section.rules.length > 6 ? (
            <li className="text-xs text-secondary">
              +{section.rules.length - 6}
              {tUi('m_84b30f4ef3')}
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-secondary">{tUi('m_d029541693')}</p>
      )}
    </div>
  );
}

function ExportRow({ snapshot }: { snapshot: DesignSystemSnapshot }) {
  const tUi = useTranslations('settings');

  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{tUi('m_f3e4fadb9e')}</p>
        <p className="mt-0.5 text-xs text-secondary">{tUi('m_a14cd6f916')}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await downloadDesignSystemBundle(snapshot);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download className="size-4" />
        {busy ? tUi('m_0b1d6c0b1a') : tUi('m_a479c9c34e')}
      </Button>
    </div>
  );
}
