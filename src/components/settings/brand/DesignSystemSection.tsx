'use client';

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
              <p className="font-medium text-primary">
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
            Got it
          </Button>
        </div>
      ))}
    </div>
  );
}

const TIERS = ['strict', 'guided', 'loose'] as const;
const TIER_LABELS = { strict: 'Lock', guided: 'Guide', loose: 'Explore' } as const;

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
  const [saving, setSaving] = useState(false);
  const active = snapshot.rigor.override ?? snapshot.rigor.tier;
  const evidence = snapshot.rigor.evidence;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">How should Continuum apply this?</p>
          <p className="mt-0.5 text-xs text-secondary">
            We recommend <span className="font-medium">{TIER_LABELS[snapshot.rigor.tier]}</span>{' '}
            from {evidence.tokenCount} tokens
            {evidence.hasAdherenceConfig ? ', an adherence config' : ''}
            {evidence.imperativeRuleCount > 0
              ? `, and ${evidence.imperativeRuleCount} explicit rules`
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
          <h4 className="text-sm font-semibold text-primary">{section.title}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={section.provenance === 'declared' ? 'default' : 'secondary'}>
              {section.provenance === 'declared'
                ? 'From your files'
                : section.provenance === 'edited'
                  ? 'Edited by you'
                  : 'Read from prose'}
            </Badge>
            {section.provenance === 'inferred' ? (
              <span className="text-xs text-secondary">
                {Math.round(section.confidence * 100)}% confidence
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={section.enabled}
            aria-label={`Apply ${section.title} when generating`}
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
            aria-label={editing ? 'Cancel editing' : `Edit ${section.title}`}
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
            aria-label={`${section.title} rules, one per line`}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              <Check className="size-4" />
              {saving ? 'Saving…' : 'Save'}
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
                    ? 'shrink-0 font-medium text-primary'
                    : 'shrink-0 text-secondary'
                }
              >
                {rule.strength === 'hard' ? 'Must' : 'Prefer'}
              </span>
              <span className="text-secondary">{rule.statement}</span>
            </li>
          ))}
          {section.rules.length > 6 ? (
            <li className="text-xs text-secondary">+{section.rules.length - 6} more</li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-secondary">No rules recorded for this section.</p>
      )}
    </div>
  );
}

function ExportRow({ snapshot }: { snapshot: DesignSystemSnapshot }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium text-primary">Export</p>
        <p className="mt-0.5 text-xs text-secondary">
          A portable bundle — DTCG tokens, the adherence config, and every section as markdown.
          Re-importable here, and readable by Figma or Style Dictionary.
        </p>
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
        {busy ? 'Preparing…' : 'Download'}
      </Button>
    </div>
  );
}
