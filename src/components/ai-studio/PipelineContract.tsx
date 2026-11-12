'use client';

import {
  type PipelineCapabilityV2,
  type PipelineManifest,
  pipelineBlockedReason,
} from '@continuum/contracts';
import { CircleAlert } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { cn } from '@/lib/utils';

type PipelineContractValue = PipelineManifest | PipelineCapabilityV2;

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const isV2 = (value: PipelineContractValue): value is PipelineCapabilityV2 =>
  'contract_version' in value && value.contract_version === 2;

const readableToken = (value: string): string => value.replaceAll(/[-_]/g, ' ');

function LegacyPipelineContract({ manifest }: { manifest: PipelineManifest }) {
  const translateUi = useUiTranslations('studio');

  const blocked = pipelineBlockedReason(manifest);
  const perAttempt = manifest.outputs.reduce((total, output) => total + output.count, 0);
  const portName = (port: { port_id: string; label?: string }) => port.label ?? port.port_id;

  return (
    <>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{translateUi('takes_6228c88a')}</span>{' '}
        {manifest.inputs.length === 0
          ? translateUi('nothing_1785cfc3')
          : manifest.inputs.map((input) => `${portName(input)} (${input.kind})`).join(', ')}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{translateUi('gives_f74fc9fe')}</span>{' '}
        {manifest.outputs.length === 0
          ? translateUi('nothing_1785cfc3')
          : manifest.outputs.map((output) => `${portName(output)} (${output.media})`).join(', ')}
        {perAttempt > manifest.outputs.length &&
          translateUi('value0_generated_per_attempt_808a07cf', { count: Number(perAttempt) })}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <Pill variant="warning">
          <PillIndicator variant="warning" /> {translateUi('needs_republish_827764df')}{' '}
        </Pill>
        {blocked ? (
          <Pill variant="destructive">
            <PillIndicator variant="error" /> {translateUi('cannot_run_0316aea2')}{' '}
          </Pill>
        ) : null}
        {manifest.headless.requires_authorisation ? (
          <Pill variant="warning">{translateUi('needs_approval_db0e960b')}</Pill>
        ) : null}
      </div>
      <p className="flex items-start gap-1.5 text-muted-foreground">
        <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
        <span> {translateUi('this_pipeline_was_published_with_th_312bc164')} </span>
      </p>
      {blocked ? (
        <p className="flex items-start gap-1.5 text-danger">
          <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>{blocked}</span>
        </p>
      ) : null}
    </>
  );
}

function outputPromise(output: PipelineCapabilityV2['outputs'][number]): string {
  if (output.kind === 'element_candidate') return `${output.label} (Element candidate)`;
  if (output.kind === 'planner_draft') {
    return `${output.label} (${output.count} planner draft${output.count === 1 ? '' : 's'})`;
  }
  const media = output.count === 1 ? output.media : `${output.count} ${output.media}s`;
  const shape = [
    media,
    output.aspect_ratio,
    output.duration_seconds === undefined ? undefined : `${output.duration_seconds}s`,
  ].filter(Boolean);
  return `${output.label} (${shape.join(' · ')})`;
}

// Null until a per-model price table exists; the generation cap is then the real bound.
function spendCeiling(capability: PipelineCapabilityV2): string {
  const { max_amount_minor, currency } = capability.cost_policy;
  if (max_amount_minor === null) {
    const generations = capability.execution_policy.max_generations;
    return `Up to ${generations} generation${generations === 1 ? '' : 's'} per run`;
  }
  return `Up to ${moneyFormatter.format(max_amount_minor / 100)} ${currency}`;
}

// Each gate with the media it judges, and its floor where it has one: an image passes on
// the gate's verdict alone, a video must also reach its score. The single-floor branch reads
// a Backend that has not redeployed yet; drop it with the contract's legacy shape.
function qualityLine(policy: PipelineCapabilityV2['quality_policy']): string {
  if (!('checks' in policy)) {
    const checks = policy.required_checks.map(readableToken).join(', ');
    return `${Math.round(policy.minimum_score * 100)}% minimum${checks ? ` · ${checks}` : ''}`;
  }
  return policy.checks
    .map((check) => {
      const floor =
        check.minimum_score === null ? '' : ` ≥ ${Math.round(check.minimum_score * 100)}%`;
      return `${readableToken(check.check_id)}${floor} (${check.media.join(', ')})`;
    })
    .join(' · ');
}

function V2PipelineContract({ capability }: { capability: PipelineCapabilityV2 }) {
  const translateUi = useUiTranslations('studio');

  const requiredInputs = capability.inputs.filter((input) => input.required);

  return (
    <>
      {capability.description ? (
        <p className="text-muted-foreground">{capability.description}</p>
      ) : null}
      {capability.agent_guide ? (
        <div className="grid gap-1 rounded-md border border-border/70 p-2 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{translateUi('use_when_33afee12')}</span>{' '}
            {capability.agent_guide.use_when.join(' ')}
          </p>
          {capability.agent_guide.avoid_when.length > 0 ? (
            <p>
              <span className="font-medium text-foreground">
                {translateUi('avoid_when_054b3013')}
              </span>{' '}
              {capability.agent_guide.avoid_when.join(' ')}
            </p>
          ) : null}
          {capability.agent_guide.input_guidance.map((guidance) => (
            <p key={guidance.input_id}>
              <span className="font-medium text-foreground">
                {capability.inputs.find((input) => input.input_id === guidance.input_id)?.label ??
                  guidance.input_id}
                :
              </span>{' '}
              {guidance.instruction}
            </p>
          ))}
          {capability.agent_guide.invocation_notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{translateUi('required_5de693b9')}</span>{' '}
        {requiredInputs.length === 0
          ? translateUi('nothing_1785cfc3')
          : requiredInputs.map((input) => `${input.label} (${input.kind})`).join(', ')}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{translateUi('promised_a77ad53c')}</span>{' '}
        {capability.outputs.map(outputPromise).join(', ')}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{translateUi('cost_97c94eff')}</span>{' '}
        {spendCeiling(capability)}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{translateUi('quality_475131ae')}</span>{' '}
        {qualityLine(capability.quality_policy)}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <Pill variant="success">
          <PillIndicator variant="success" /> {translateUi('runnable_c687f9d1')}{' '}
        </Pill>
        <Pill variant="muted">
          {translateUi('revision_2e516d68')} {capability.identity.revision}
        </Pill>
      </div>
    </>
  );
}

export function PipelineContract({
  manifest,
  className,
}: {
  manifest: PipelineContractValue;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1 text-xs', className)} data-testid="pipeline-contract">
      {isV2(manifest) ? (
        <V2PipelineContract capability={manifest} />
      ) : (
        <LegacyPipelineContract manifest={manifest} />
      )}
    </div>
  );
}
