'use client';

// An audience proposal, opened. Five sections in the order a person decides in — qué
// audiencia, audiencia actual / qué cambia, qué es nuevo, por qué una audiencia nueva, cómo
// se implementa — and under them the one decision: create the new ad set. Every state of the
// proposal row keeps the same frame, from "the daily analysis has not run yet" through a
// blocked proposal (the reason where the audience would be, the button visibly off) to
// "here is what Meta now holds".

import type {
  AdSetSnapshot,
  AudienceProposalBlock,
  AudienceProposalPlan,
  ConvertCboResponse,
  RecommendationRow,
} from '@continuum/contracts';
import { adsManagerUrls, clampBudgetMinorUnits } from '@continuum/contracts';
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  Loader2Icon,
  SparklesIcon,
  UndoIcon,
} from 'lucide-react';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../format';
import * as typeScale from '../typeScale';
import {
  type AudienceCardView,
  type AudienceDiffRow,
  audienceDiff,
  audienceNovelty,
  estimateLabel,
  implementationLines,
  implementedRows,
  majorUnits,
  minorUnits,
  type PortfolioAdsetSpec,
  proposedAudience,
  reachDeltaLabel,
  triggerLabel,
} from './audienceCardModel';
import { evidenceLine, queueHeadlineLine } from './recQueueModel';

export type AudienceRecommendationCardProps = {
  rec: RecommendationRow;
  adsetName: string | null;
  snapshot: AdSetSnapshot | null;
  view: AudienceCardView;
  /** The portfolio's enrolled ad sets with their live targeting, for "qué es nuevo". */
  portfolioSpecs: readonly PortfolioAdsetSpec[];
  currency: string | null;
  adAccountId: string;
  onRequest: () => void;
  requesting: boolean;
  onApprove: (input: { budgetMinorUnits: number; activate: boolean }) => void;
  approving: boolean;
  onCancel: () => void;
  onActivate: () => void;
  onUndo: () => void;
  busy: boolean;
  /** CBO fix: dry-run first (preview), then the real conversion. */
  onConvertCbo: (campaignId: string, dryRun: boolean) => void;
  convertingCbo: boolean;
  cboPreview: ConvertCboResponse | null;
  resultWord: string;
};

/** The card's buttons, one size up from the dense `sm` default. */
const ROOMY_BUTTON = 'h-8 px-3 text-sm';

const ASK_AGAIN = 'Pedírsela a Jaina de nuevo';

function Section({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <h4 className={`${typeScale.label} text-muted-foreground`}>{label}</h4>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: readonly AudienceDiffRow[] }) {
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.map((row) => (
        <div className="flex items-baseline gap-2" key={`${row.label}:${row.value}`}>
          <dt className="w-28 shrink-0 text-muted-foreground text-xs">{row.label}</dt>
          <dd className="min-w-0 break-words text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

// ── Qué audiencia ──────────────────────────────────────────────────────────────────────

function WhatAudience({
  plan,
  state,
  block,
  errorMessage,
}: {
  plan: AudienceProposalPlan | null;
  state: AudienceCardView['state'];
  block: AudienceProposalBlock | null;
  errorMessage: string | null;
}) {
  if (plan) {
    const proposed = proposedAudience(plan);
    return (
      <>
        <p className={`${typeScale.bodyLg} text-foreground`}>{proposed.words}</p>
        {proposed.reach ? (
          <p className="text-muted-foreground text-sm tabular-nums">
            Alcance estimado {proposed.reach}
          </p>
        ) : null}
      </>
    );
  }
  if (state === 'blocked' || state === 'blocked_cbo') {
    return (
      <div className="space-y-1.5">
        <Badge className={typeScale.label} variant="warning">
          Bloqueada
        </Badge>
        <p className="text-foreground text-sm" data-testid="audience-blocked-reason">
          {block?.message ?? 'No se pudo armar la propuesta.'}
        </p>
      </div>
    );
  }
  if (state === 'queued' || state === 'proposing') {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2Icon className="size-3.5 animate-spin" />
        {state === 'queued'
          ? 'En cola: Jaina la toma en menos de un minuto.'
          : 'Jaina está leyendo la audiencia, el catálogo y los creativos…'}
      </p>
    );
  }
  if (state === 'failed') {
    return (
      <div className="space-y-1">
        <p className="font-medium text-foreground text-sm">El análisis falló</p>
        <Muted>{errorMessage ?? 'Error desconocido.'}</Muted>
      </div>
    );
  }
  return (
    <Muted>
      Jaina la propone con el ciclo diario del optimizador para este conjunto. Pedila ahora para
      tenerla hoy.
    </Muted>
  );
}

// ── Audiencia actual / Qué cambia ──────────────────────────────────────────────────────

function CurrentAndChanges({
  plan,
  snapshot,
}: {
  plan: AudienceProposalPlan | null;
  snapshot: AdSetSnapshot | null;
}) {
  const diff = plan ? audienceDiff(plan) : null;
  const reach = plan ? estimateLabel(plan.reach.current) : null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section label="Audiencia actual" testId="audience-current">
        {diff?.hasPrevious ? (
          <Rows rows={diff.current} />
        ) : (
          <Muted>
            {snapshot?.audienceType
              ? `Sin registro de la segmentación actual; el conjunto es de ${snapshot.audienceType}.`
              : 'Sin registro de la segmentación actual.'}
          </Muted>
        )}
        {reach || snapshot?.frequency7d != null ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {[
              reach ? `Alcance ${reach}` : null,
              snapshot?.frequency7d != null
                ? `frecuencia ${snapshot.frequency7d.toFixed(1)} · 7 días`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </Section>
      <Section label="Qué cambia" testId="audience-changes">
        {!diff ? (
          <Muted>Nada todavía: no hay propuesta armada.</Muted>
        ) : diff.changes.length === 0 ? (
          <Muted>La propuesta no cambia la segmentación.</Muted>
        ) : (
          <>
            {!diff.hasPrevious ? (
              <Muted>Sin audiencia previa registrada; esto es la propuesta completa.</Muted>
            ) : null}
            <Rows rows={diff.changes} />
          </>
        )}
      </Section>
    </div>
  );
}

// ── Qué es nuevo ───────────────────────────────────────────────────────────────────────

function WhatIsNew({
  plan,
  portfolioSpecs,
}: {
  plan: AudienceProposalPlan | null;
  portfolioSpecs: readonly PortfolioAdsetSpec[];
}) {
  if (!plan) return <Muted>Se sabe cuando haya propuesta.</Muted>;
  const novelty = audienceNovelty(plan, portfolioSpecs);
  const compared =
    novelty.comparedAdsets > 0
      ? `Comparado con ${novelty.comparedAdsets === 1 ? 'el otro conjunto' : `los otros ${novelty.comparedAdsets} conjuntos`} del portafolio.`
      : 'Comparado solo con este conjunto: el portafolio no trajo la segmentación de los demás.';
  return (
    <div className="space-y-2 text-sm">
      {novelty.fresh.length > 0 ? (
        <ul className="space-y-1" data-testid="audience-fresh">
          {novelty.fresh.map((item) => (
            <li className="text-foreground" key={`${item.kindLabel}:${item.name}`}>
              {item.name}
              <span className="text-muted-foreground"> · {item.kindLabel} · nadie lo usa hoy</span>
            </li>
          ))}
        </ul>
      ) : (
        <Muted>Nada que el portafolio no use ya.</Muted>
      )}
      {novelty.reused.length > 0 ? (
        <ul className="space-y-1" data-testid="audience-reused">
          {novelty.reused.map((item) => (
            <li className="text-muted-foreground" key={`${item.kindLabel}:${item.name}`}>
              {item.name} ya se usa en {item.usedIn.join(', ')}
            </li>
          ))}
        </ul>
      ) : null}
      {novelty.excludedByRule.length > 0 ? (
        <ul className="space-y-1" data-testid="audience-excluded">
          {novelty.excludedByRule.map((item) => (
            <li className="text-muted-foreground" key={item.name}>
              <span className="line-through">{item.name}</span> · descartado por regla de marca:{' '}
              {item.rule}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-muted-foreground text-xs">{compared}</p>
    </div>
  );
}

// ── Por qué una audiencia nueva ────────────────────────────────────────────────────────

function Why({
  plan,
  rec,
  currency,
}: {
  plan: AudienceProposalPlan | null;
  rec: RecommendationRow;
  currency: string | null;
}) {
  const evidence = queueHeadlineLine(rec, currency) ?? evidenceLine(rec.evidence, currency);
  return (
    <div className="space-y-1.5">
      <p className="text-sm">
        <span className="font-medium text-foreground">{triggerLabel(rec.trigger)}</span>
        {evidence ? <span className="text-muted-foreground"> · {evidence}</span> : null}
      </p>
      {plan ? (
        <>
          <p className={`${typeScale.bodyLg} text-foreground`}>{plan.diagnosis}</p>
          <Muted>{plan.rationale}</Muted>
        </>
      ) : rec.reason ? (
        <Muted>{rec.reason}</Muted>
      ) : null}
    </div>
  );
}

// ── Cómo se implementa ─────────────────────────────────────────────────────────────────

function HowItIsImplemented({
  plan,
  state,
  currency,
}: {
  plan: AudienceProposalPlan | null;
  state: AudienceCardView['state'];
  currency: string | null;
}) {
  if (!plan) {
    return (
      <Muted>
        {state === 'blocked' || state === 'blocked_cbo'
          ? 'No se crea nada mientras la propuesta esté bloqueada.'
          : 'Un conjunto nuevo, pausado, junto al actual; el actual sigue corriendo.'}
      </Muted>
    );
  }
  return (
    <div className="space-y-3">
      <Rows rows={implementationLines(plan, currency)} />
      {plan.creatives.length > 0 ? (
        <div>
          <ul className="flex flex-wrap gap-3">
            {plan.creatives.map((creative) => (
              <li className="w-28" key={creative.creative_id}>
                {creative.poster_url ? (
                  // biome-ignore lint/performance/noImgElement: signed, expiring Meta CDN URL; next/image cannot proxy it.
                  <img
                    alt={creative.ad_name ?? creative.ad_id}
                    className="aspect-square w-full rounded-md border border-border/60 object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={creative.poster_url}
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md border border-border/60 border-dashed text-muted-foreground text-xs tabular-nums">
                    #{creative.rank}
                  </div>
                )}
                <p
                  className="mt-1.5 truncate text-foreground text-xs"
                  title={creative.ad_name ?? creative.ad_id}
                >
                  {creative.ad_name ?? creative.ad_id}
                </p>
                <p className="truncate text-muted-foreground text-xs tabular-nums">
                  {creative.cost_per_event != null
                    ? formatCurrency(creative.cost_per_event, currency)
                    : '—'}{' '}
                  · {creative.events} · {creative.source_adset_name ?? creative.source_adset_id}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-muted-foreground text-xs">{plan.creatives_disclosure}</p>
        </div>
      ) : null}
    </div>
  );
}

// ── The card ───────────────────────────────────────────────────────────────────────────

export function AudienceRecommendationCard(props: AudienceRecommendationCardProps) {
  const { rec, view, currency, adAccountId, portfolioSpecs } = props;
  const { plan, state, block, result, row } = view;
  const [budgetMajor, setBudgetMajor] = React.useState<string>('');
  const [activate, setActivate] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  React.useEffect(() => {
    if (plan) setBudgetMajor(String(majorUnits(plan.budget.suggested_minor_units)));
  }, [plan]);

  const budgetMinor = plan
    ? clampBudgetMinorUnits(minorUnits(Number(budgetMajor) || 0), plan.budget.bounds)
    : 0;
  const budgetClamped = plan ? budgetMinor !== minorUnits(Number(budgetMajor) || 0) : false;
  const reachDelta = plan ? reachDeltaLabel(plan) : null;
  const urls = result
    ? adsManagerUrls({
        adAccountId,
        campaignId: result.campaign?.id ?? plan?.source.campaign_id ?? null,
        adsetId: result.adset?.id ?? null,
        adIds: result.ads.map((ad) => ad.id),
      })
    : null;

  return (
    <div className="space-y-6" data-testid="audience-recommendation-card">
      <Section label="Qué audiencia" testId="audience-what">
        <WhatAudience block={block} errorMessage={view.errorMessage} plan={plan} state={state} />
        {reachDelta ? (
          <p className="text-muted-foreground text-xs tabular-nums">Alcance {reachDelta}</p>
        ) : null}
      </Section>

      <CurrentAndChanges plan={plan} snapshot={props.snapshot} />

      <Section label="Qué es nuevo" testId="audience-new">
        <WhatIsNew plan={plan} portfolioSpecs={portfolioSpecs} />
      </Section>

      <Section label="Por qué una audiencia nueva" testId="audience-why">
        <Why currency={currency} plan={plan} rec={rec} />
      </Section>

      <Section label="Cómo se implementa" testId="audience-how">
        <HowItIsImplemented currency={currency} plan={plan} state={state} />
      </Section>

      {/* The decision */}
      <section className="space-y-3 border-border/50 border-t pt-4" data-testid="audience-decision">
        {state === 'none' || state === 'failed' ? (
          <Button
            className={ROOMY_BUTTON}
            disabled={props.requesting}
            onClick={props.onRequest}
            size="sm"
            type="button"
            variant="secondary"
          >
            {props.requesting ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="size-3.5" />
            )}
            {state === 'failed' ? ASK_AGAIN : 'Pedírsela a Jaina ahora'}
          </Button>
        ) : null}

        {state === 'blocked_cbo' && block ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-foreground">Esta campaña tiene el presupuesto</p>
            <Muted>
              Las recomendaciones necesitan presupuesto diario por conjunto para marcar el ritmo y
              comparar conjuntos. Convertí la campaña y pedile la propuesta a Jaina de nuevo.
            </Muted>
            {props.cboPreview?.ok && props.cboPreview.dryRun !== false ? (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="mb-1 font-medium text-foreground">
                  Vista previa: {props.cboPreview.adset_budgets.length} conjunto
                  {props.cboPreview.adset_budgets.length === 1 ? '' : 's'} con presupuesto diario
                  propio
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  {props.cboPreview.adset_budgets.slice(0, 6).map((b) => (
                    <li className="truncate" key={b.adset_id}>
                      {b.adset_name ?? b.adset_id} ·{' '}
                      {formatCurrency(b.daily_major, props.cboPreview?.currency ?? currency)}/día
                    </li>
                  ))}
                </ul>
                <Button
                  className={cn('mt-2', ROOMY_BUTTON)}
                  disabled={props.convertingCbo || !block.campaign_id}
                  onClick={() => block.campaign_id && props.onConvertCbo(block.campaign_id, false)}
                  size="sm"
                  type="button"
                >
                  {props.convertingCbo ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                  Convertir la campaña a presupuestos por conjunto
                </Button>
              </div>
            ) : props.cboPreview?.ok && props.cboPreview.dryRun === false ? (
              <p className="text-foreground">
                Convertida{props.cboPreview.deduped ? ' (ya hoy)' : ''}. Pedile la propuesta a Jaina
                de nuevo.
              </p>
            ) : (
              <Button
                className={ROOMY_BUTTON}
                disabled={props.convertingCbo || !block.campaign_id}
                onClick={() => block.campaign_id && props.onConvertCbo(block.campaign_id, true)}
                size="sm"
                type="button"
                variant="secondary"
              >
                {props.convertingCbo ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                Previsualizar la conversión
              </Button>
            )}
            <Button
              className={ROOMY_BUTTON}
              disabled={props.requesting}
              onClick={props.onRequest}
              size="sm"
              type="button"
              variant="ghost"
            >
              {ASK_AGAIN}
            </Button>
          </div>
        ) : null}

        {state === 'blocked' ? (
          <div className="space-y-3 text-sm">
            {/* The decision this section exists for, visibly off, with the reason above it in
                "Qué audiencia" — a blocked proposal must read as blocked here, not as a frame
                with nothing at the end. Same control a ready proposal offers. */}
            <Button
              className={ROOMY_BUTTON}
              data-testid="audience-create-blocked"
              disabled
              size="sm"
              title={block?.message}
              type="button"
            >
              Crear el conjunto nuevo (pausado)
            </Button>
            {rec.status === 'pending' ? (
              <Button
                className={ROOMY_BUTTON}
                disabled={props.requesting}
                onClick={props.onRequest}
                size="sm"
                type="button"
                variant="secondary"
              >
                {ASK_AGAIN}
              </Button>
            ) : (
              <Muted>
                El ciclo ya cerró esta recomendación, así que no se puede volver a pedir desde acá.
              </Muted>
            )}
          </div>
        ) : null}

        {state === 'ready' && plan ? (
          <div className="space-y-3 text-sm">
            <label className="block space-y-1" htmlFor={`budget-${rec.id}`}>
              <span className="text-muted-foreground">
                Presupuesto diario ({plan.budget.currency})
              </span>
              <Input
                className="h-8 max-w-48 text-sm"
                id={`budget-${rec.id}`}
                inputMode="decimal"
                onChange={(event) => setBudgetMajor(event.target.value)}
                value={budgetMajor}
              />
              <span className="block text-muted-foreground text-xs tabular-nums">
                entre {majorUnits(plan.budget.bounds.min_minor_units)} y{' '}
                {majorUnits(plan.budget.bounds.max_minor_units)}
                {budgetClamped ? ' · ajustado a los límites' : ''}
                {plan.budget.note ? ` · ${plan.budget.note}` : ''}
              </span>
            </label>
            <label className="flex items-center gap-2" htmlFor={`activate-${rec.id}`}>
              <Switch checked={activate} id={`activate-${rec.id}`} onCheckedChange={setActivate} />
              <span className="text-foreground">Empezar activo</span>
              <span className="text-muted-foreground">
                {activate
                  ? plan.mode === 'replace'
                    ? '— pausa el conjunto actual cuando el nuevo esté en vivo'
                    : '— entrega apenas Meta lo apruebe'
                  : '— se crea pausado; vos lo activás'}
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                className={ROOMY_BUTTON}
                data-testid="audience-create"
                disabled={props.approving || props.busy}
                onClick={() => setConfirmOpen(true)}
                size="sm"
                type="button"
              >
                {props.approving ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                Crear el conjunto nuevo ({activate ? 'activo' : 'pausado'})
              </Button>
              <Button
                className={ROOMY_BUTTON}
                disabled={props.busy}
                onClick={props.onCancel}
                size="sm"
                type="button"
                variant="ghost"
              >
                Descartar
              </Button>
            </div>
            <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Crear "{plan.adset_name}" en Meta?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Un conjunto nuevo en {plan.source.campaign_name ?? 'esta campaña'} con la
                    audiencia propuesta,{' '}
                    {formatCurrency(majorUnits(budgetMinor), plan.budget.currency)}
                    /día y {plan.creatives.length} anuncio
                    {plan.creatives.length === 1 ? '' : 's'} que reusan los mejores creativos del
                    portafolio.{' '}
                    {activate
                      ? plan.mode === 'replace'
                        ? `Arranca activo y "${plan.source.adset_name ?? 'el conjunto actual'}" se pausa cuando esté en vivo.`
                        : 'Arranca activo.'
                      : 'Se crea pausado; lo activás desde esta tarjeta.'}{' '}
                    Meta reinicia la fase de aprendizaje para un conjunto nuevo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setConfirmOpen(false);
                      props.onApprove({ budgetMinorUnits: budgetMinor, activate });
                    }}
                  >
                    Crear el conjunto
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}

        {state === 'approved' ||
        state === 'executing' ||
        state === 'switching' ||
        state === 'undoing' ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-3.5 animate-spin" />
            {state === 'approved'
              ? 'Aprobada: el worker lo crea en menos de un minuto.'
              : state === 'executing'
                ? 'Creando el conjunto y sus anuncios en Meta…'
                : state === 'switching'
                  ? 'Activando el conjunto nuevo…'
                  : 'Deshaciendo…'}
          </p>
        ) : null}

        {(state === 'executed' || state === 'undone') && result ? (
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                {state === 'undone' ? 'Deshecho' : 'Creado en Meta'}
                {(row?.approval as { via?: string } | null)?.via === 'autopilot' ? (
                  <Badge className="ml-2 text-xs" variant="success">
                    Aprobado por autopilot · creado pausado
                  </Badge>
                ) : null}
              </p>
              {result.campaign ? (
                <p className="truncate text-muted-foreground">
                  Campaña {result.campaign.name ?? ''}{' '}
                  <span className="text-xs tabular-nums">{result.campaign.id}</span>
                </p>
              ) : null}
              {result.adset ? (
                <p className="truncate">
                  Conjunto {result.adset.name ?? ''}{' '}
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {result.adset.id}
                  </span>{' '}
                  · {result.adset.effective_status ?? result.adset.status ?? ''}
                  {urls?.adset ? (
                    <a
                      className="ml-1 inline-flex items-center gap-0.5 text-primary"
                      href={urls.adset}
                      rel="noreferrer"
                      target="_blank"
                    >
                      abrir <ExternalLinkIcon className="size-3.5" />
                    </a>
                  ) : null}
                </p>
              ) : null}
              {result.ads.map((ad, index) => (
                <p className="truncate text-muted-foreground" key={ad.id}>
                  Anuncio {ad.name ?? ''} <span className="text-xs tabular-nums">{ad.id}</span> ·{' '}
                  {ad.effective_status ?? ad.status ?? ''}
                  {urls?.ads[index] ? (
                    <a
                      className="ml-1 inline-flex items-center gap-0.5 text-primary"
                      href={urls.ads[index]}
                      rel="noreferrer"
                      target="_blank"
                    >
                      abrir <ExternalLinkIcon className="size-3.5" />
                    </a>
                  ) : null}
                </p>
              ))}
            </div>
            <Collapsible>
              <CollapsibleTrigger
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'h-8 gap-1.5 px-3 text-sm',
                )}
              >
                <ChevronDownIcon className="size-3.5" /> Qué se implementó
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1.5 rounded-md border border-border/60 bg-muted/20 p-3">
                  <Rows rows={implementedRows(result, plan)} />
                </div>
              </CollapsibleContent>
            </Collapsible>
            {state === 'executed' ? (
              <div className="flex flex-wrap gap-2">
                {plan?.mode === 'replace' && !result.activation?.requested ? (
                  <Button
                    className={ROOMY_BUTTON}
                    disabled={props.busy}
                    onClick={props.onActivate}
                    size="sm"
                    type="button"
                  >
                    Cambiar al nuevo
                  </Button>
                ) : null}
                {!result.activation?.requested && plan?.mode === 'add' ? (
                  <Button
                    className={ROOMY_BUTTON}
                    disabled={props.busy}
                    onClick={props.onActivate}
                    size="sm"
                    type="button"
                  >
                    Activar
                  </Button>
                ) : null}
                <Button
                  className={ROOMY_BUTTON}
                  disabled={props.busy}
                  onClick={props.onUndo}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <UndoIcon className="size-3.5" /> Deshacer
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {row?.status === 'failed' && result?.adset ? (
          <Muted>
            Quedó un resultado parcial (conjunto {result.adset.id}); reintentar retoma desde ahí.
          </Muted>
        ) : null}
      </section>
    </div>
  );
}
