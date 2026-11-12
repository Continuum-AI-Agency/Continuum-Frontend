'use client';
import { useLocale, useTranslations } from 'next-intl';

// The engine half of the brand surface.
//
// The cards above these panels are for EDITING a design system — a title, a provenance
// badge, and the brand's own sentences, one card per section. These panels answer the
// other question: what will the engine actually do with it. They are read-only by
// design, and they sit beside the cards rather than replacing them, because the
// `edited_at` sticky-edit protection lives on those cards and is the single most
// important behaviour on this page.
//
// Every derivation is in `brandPanels.ts` and is pure. This file is layout: rows, badges,
// and the one rule that makes the layout mean something — a value that is compared down a
// column gets `tabular-nums`, so 0.771 and 1.024 line up on the decimal point.

import type { DesignSystemFontFace, DesignSystemSnapshot } from '@continuum/contracts';
import { useMemo } from 'react';
import { NoSpecimenText, TypefaceHoldBadge } from '@/components/brand/typefaceHonesty';
import { Badge } from '@/components/ui/badge';
import {
  type BrandFacts,
  type ColourRow,
  deriveBrandFacts,
  deriveColourUsage,
  deriveLayoutSpec,
  deriveRuleLedger,
  deriveTypeInventory,
  type LayoutSpec,
  type RuleLedger,
  type SpecRow,
  type TypeInventory,
} from './brandPanels';

export interface BrandEnginePanelsProps {
  snapshot: DesignSystemSnapshot;
  /** `null` means the Backend never reported the font store, not that it is empty. */
  fontsInStore: DesignSystemFontFace[] | null;
}

export function BrandEnginePanels({ snapshot, fontsInStore }: BrandEnginePanelsProps) {
  const uiLocale = useLocale();
  const tUi = useTranslations('settings');
  const layout = useMemo(
    () => deriveLayoutSpec(snapshot, tUi, uiLocale),
    [snapshot, tUi, uiLocale],
  );
  const typography = useMemo(
    () => deriveTypeInventory(snapshot, fontsInStore, tUi),
    [snapshot, fontsInStore, tUi],
  );
  const colours = useMemo(() => deriveColourUsage(snapshot, tUi), [snapshot, tUi]);
  const facts = useMemo(() => deriveBrandFacts(snapshot, tUi), [snapshot, tUi]);
  const ledger = useMemo(() => deriveRuleLedger(snapshot, tUi), [snapshot, tUi]);

  return (
    <div className="space-y-4" data-testid="brand-engine-panels">
      <LayoutSpecPanel spec={layout} />
      <TypeInventoryPanel inventory={typography} />
      <ColourUsagePanel rows={colours} />
      <BrandFactsPanel facts={facts} />
      <RuleMeasurementPanel ledger={ledger} />
    </div>
  );
}

/* ── shared chrome ──────────────────────────────────────────────────────────── */

function Panel({
  title,
  note,
  testId,
  children,
}: {
  title: string;
  note: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-4" data-testid={testId}>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <p className="mt-0.5 text-xs text-secondary">{note}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * The empty state.
 *
 * An instruction, never a blank region and never the word "None" on its own: a reader who
 * cannot see why a panel is empty has no way to make it non-empty.
 */
function Instruction({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-secondary"
      data-testid="panel-instruction"
    >
      {children}
    </p>
  );
}

/** `label — note — value`, value hard right and tabular so a column compares. */
function Row({ row, testId, valueTestId }: { row: SpecRow; testId: string; valueTestId: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-6 border-b border-border/50 py-2 last:border-b-0"
      data-testid={testId}
      data-label={row.label}
    >
      <div className="min-w-0">
        <p className="text-sm text-foreground">{row.label}</p>
        {row.note ? <p className="mt-0.5 text-xs text-secondary">{row.note}</p> : null}
      </div>
      <p
        className="shrink-0 text-right font-mono text-sm tabular-nums text-foreground"
        data-testid={valueTestId}
      >
        {row.value}
      </p>
    </div>
  );
}

/** Right-aligned, small, grey — the receipt, not the claim. */
function Provenance({ source, testId }: { source: string | null; testId: string }) {
  const tUi = useTranslations('settings');

  return source ? (
    <span
      className="shrink-0 text-right text-xs text-secondary"
      data-testid={testId}
      data-provenance="recorded"
    >
      {source}
    </span>
  ) : (
    <span
      className="shrink-0 text-right text-xs text-amber-700 dark:text-amber-300"
      data-testid={testId}
      data-provenance="none"
    >
      {tUi('m_4ecc0f8bba')}
    </span>
  );
}

/* ── 1. Layout spec ─────────────────────────────────────────────────────────── */

function LayoutSpecPanel({ spec }: { spec: LayoutSpec }) {
  const tUi = useTranslations('settings');

  return (
    <Panel
      title={tUi('m_6851c4712c')}
      note={
        spec.baseWidth === null
          ? tUi('brandLayoutFractionNote')
          : tUi('brandLayoutMeasuredNote', { width: spec.baseWidth })
      }
      testId="brand-panel-layout"
    >
      {spec.absent ? (
        <Instruction>{spec.absent}</Instruction>
      ) : (
        <div>
          {spec.rows.map((row) => (
            <Row key={row.label} row={row} testId="layout-row" valueTestId="layout-value" />
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── 2. Typography ──────────────────────────────────────────────────────────── */

function TypeInventoryPanel({ inventory }: { inventory: TypeInventory }) {
  const tUi = useTranslations('settings');

  return (
    <Panel
      title={tUi('m_c3b1b863ae')}
      note={tUi('brandFontInventoryNote')}
      testId="brand-panel-type"
    >
      {inventory.absent ? (
        <Instruction>{inventory.absent}</Instruction>
      ) : (
        <>
          {inventory.storeUnknown ? <Instruction>{tUi('m_9f4f114247')}</Instruction> : null}
          <div>
            {inventory.rows.map((row) => (
              <div
                key={`${row.family}-${row.weight}`}
                className="flex items-baseline justify-between gap-6 border-b border-border/50 py-2 last:border-b-0"
                data-testid="type-row"
                data-family={row.family}
                data-weight={row.weight}
                data-present={row.present ? 'true' : 'false'}
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {row.family} <span className="tabular-nums text-secondary">{row.weight}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-secondary">{row.usedFor}</p>
                </div>
                <div className="flex shrink-0 items-baseline gap-3">
                  <span className="text-right text-xs text-secondary">{row.detail}</span>
                  <TypefaceHoldBadge held={row.present} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-secondary">
            <NoSpecimenText />
          </p>
        </>
      )}
    </Panel>
  );
}

/* ── 3. Colour, twice ───────────────────────────────────────────────────────── */

function ColourUsagePanel({ rows }: { rows: ColourRow[] }) {
  const tUi = useTranslations('settings');

  return (
    <Panel
      title={tUi('m_f28563a477')}
      note={tUi('brandPaletteRulesNote')}
      testId="brand-panel-colour"
    >
      {rows.length === 0 ? (
        <Instruction>{tUi('m_2bc35d0446')}</Instruction>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" data-testid="colour-strip">
            {rows.map((row) => (
              <span
                key={row.name}
                // A hairline, so a white-adjacent tint still reads as an object rather than
                // as a hole in the card.
                className="size-8 rounded-md border border-black/15 dark:border-white/20"
                style={{ backgroundColor: row.hex }}
                title={tUi('m_a79fb214ea', { v0: String(row.name), v1: String(row.hex) })}
                data-testid="colour-swatch"
                data-hex={row.hex}
              />
            ))}
          </div>
          <div className="mt-3">
            {rows.map((row) => (
              <div
                key={row.name}
                className="flex items-baseline justify-between gap-6 border-b border-border/50 py-2 last:border-b-0"
                data-testid="colour-row"
                data-hex={row.hex}
                data-recorded={row.recorded ? 'true' : 'false'}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-3.5 shrink-0 rounded-sm border border-black/15 dark:border-white/20"
                    style={{ backgroundColor: row.hex }}
                  />
                  <span className="text-sm text-foreground">{row.name}</span>
                  <span className="font-mono text-xs tabular-nums text-secondary">{row.hex}</span>
                </div>
                <p
                  className={`shrink-0 max-w-[55%] text-right text-xs ${row.recorded ? 'text-secondary' : 'text-amber-700 dark:text-amber-300'}`}
                  data-testid="colour-usage"
                >
                  {row.usage}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

/* ── 4. Facts ───────────────────────────────────────────────────────────────── */

function BrandFactsPanel({ facts }: { facts: BrandFacts }) {
  const tUi = useTranslations('settings');

  return (
    <Panel
      title={tUi('m_ac07178510')}
      note={
        facts.withoutProvenance === 0
          ? tUi('brandFactsSourcesNote')
          : tUi('brandFactsMissingSourcesNote', {
              count: facts.withoutProvenance,
              total: facts.rows.length,
            })
      }
      testId="brand-panel-facts"
    >
      {facts.rows.length === 0 ? (
        <Instruction>{tUi('m_ad764e13d0')}</Instruction>
      ) : (
        <div>
          {facts.rows.map((row) => (
            <div
              key={row.fact}
              className="flex items-baseline justify-between gap-6 border-b border-border/50 py-2 last:border-b-0"
              data-testid="fact-row"
            >
              <p className="min-w-0 text-sm text-foreground">{row.fact}</p>
              <Provenance source={row.provenance} testId="fact-provenance" />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── 5. Rules, by measurement ───────────────────────────────────────────────── */

function RuleMeasurementPanel({ ledger }: { ledger: RuleLedger }) {
  const tUi = useTranslations('settings');

  const inert = ledger.rules.filter((rule) => rule.enforcedBy === null).length;
  return (
    <Panel
      title={tUi('m_2b28d77721')}
      note={
        ledger.rules.length === 0
          ? tUi('brandRuleMeasurementNote')
          : tUi('brandStoredRulesNote', { count: ledger.rules.length, inert })
      }
      testId="brand-panel-rules"
    >
      {ledger.absent ? <Instruction>{ledger.absent}</Instruction> : null}

      {ledger.rules.length > 0 ? (
        <div>
          {ledger.rules.map((rule) => (
            <div
              key={`${rule.section}-${rule.statement}`}
              className="border-b border-border/50 py-2 last:border-b-0"
              data-testid="rule-row"
              data-section={rule.section}
              data-enforced={rule.enforcedBy === null ? 'false' : 'true'}
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="min-w-0 text-sm text-foreground" data-testid="rule-measurement">
                  {rule.measurement}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant={rule.severity === 'blocking' ? 'destructive' : 'warning'}>
                    {rule.severity === 'blocking' ? tUi('m_f7d5b2b958') : tUi('m_a5ee1e8d24')}
                  </Badge>
                  {rule.learned ? <Badge variant="muted">{tUi('m_de31af58da')}</Badge> : null}
                </div>
              </div>
              <p className="mt-0.5 text-xs text-secondary">
                {rule.sectionLabel} · {rule.statement}
              </p>
              {rule.enforcedBy === null ? (
                <p
                  className="mt-1 text-xs text-amber-700 dark:text-amber-300"
                  data-testid="rule-inert"
                >
                  {tUi('m_935e82eb84')}
                </p>
              ) : (
                <p
                  className="mt-1 text-xs text-emerald-700 dark:text-emerald-300"
                  data-testid="rule-checker"
                >
                  {tUi('m_53360b93a8')}
                  {rule.enforcedBy}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {ledger.pending.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-medium text-foreground">
            {tUi('m_ae17b8a7c3')}
            {ledger.pending.length})
          </p>
          <div className="mt-1">
            {ledger.pending.map((row) => (
              <div
                key={row.reported}
                className="flex items-baseline justify-between gap-6 border-b border-border/50 py-2 last:border-b-0"
                data-testid="pending-row"
              >
                <p className="min-w-0 text-sm text-secondary">{row.reported}</p>
                <span
                  className="shrink-0 max-w-[55%] text-right text-xs text-secondary"
                  data-testid="pending-reason"
                >
                  {row.whyNotMeasurable}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
