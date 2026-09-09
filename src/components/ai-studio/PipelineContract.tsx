'use client';

import {
  type PipelineCapabilityV2,
  type PipelineManifest,
  pipelineBlockedReason,
} from '@continuum/contracts';
import { CircleAlert } from 'lucide-react';
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
  const blocked = pipelineBlockedReason(manifest);
  const perAttempt = manifest.outputs.reduce((total, output) => total + output.count, 0);
  const portName = (port: { port_id: string; label?: string }) => port.label ?? port.port_id;

  return (
    <>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Takes:</span>{' '}
        {manifest.inputs.length === 0
          ? 'nothing'
          : manifest.inputs.map((input) => `${portName(input)} (${input.kind})`).join(', ')}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Gives:</span>{' '}
        {manifest.outputs.length === 0
          ? 'nothing'
          : manifest.outputs.map((output) => `${portName(output)} (${output.media})`).join(', ')}
        {perAttempt > manifest.outputs.length && ` · ${perAttempt} generated per attempt`}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <Pill variant="warning">
          <PillIndicator variant="warning" />
          Needs republish
        </Pill>
        {blocked ? (
          <Pill variant="destructive">
            <PillIndicator variant="error" />
            Cannot run
          </Pill>
        ) : null}
        {manifest.source === 'global' ? <Pill variant="muted">Shipped</Pill> : null}
        {manifest.headless.requires_authorisation ? (
          <Pill variant="warning">Needs approval</Pill>
        ) : null}
      </div>
      <p className="flex items-start gap-1.5 text-muted-foreground">
        <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
        <span>
          This pipeline was published with the legacy V1 contract. Republish it before running.
        </span>
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
  const media = output.count === 1 ? output.media : `${output.media}s`;
  return `${output.label} (${output.count === 1 ? media : `${output.count} ${media}`})`;
}

function V2PipelineContract({ capability }: { capability: PipelineCapabilityV2 }) {
  const requiredInputs = capability.inputs.filter((input) => input.required);
  const maximumCost = moneyFormatter.format(capability.cost_policy.max_amount_minor / 100);
  const qualityChecks = capability.quality_policy.required_checks.map(readableToken).join(', ');

  return (
    <>
      {capability.description ? (
        <p className="text-muted-foreground">{capability.description}</p>
      ) : null}
      {capability.agent_guide ? (
        <div className="grid gap-1 rounded-md border border-border/70 p-2 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Use when:</span>{' '}
            {capability.agent_guide.use_when.join(' ')}
          </p>
          {capability.agent_guide.avoid_when.length > 0 ? (
            <p>
              <span className="font-medium text-foreground">Avoid when:</span>{' '}
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
        <span className="font-medium text-foreground">Required:</span>{' '}
        {requiredInputs.length === 0
          ? 'nothing'
          : requiredInputs.map((input) => `${input.label} (${input.kind})`).join(', ')}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Promised:</span>{' '}
        {capability.outputs.map(outputPromise).join(', ')}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Cost:</span> Up to {maximumCost}{' '}
        {capability.cost_policy.currency}
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Quality:</span>{' '}
        {Math.round(capability.quality_policy.minimum_score * 100)}% minimum
        {qualityChecks ? ` · ${qualityChecks}` : ''}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <Pill variant="success">
          <PillIndicator variant="success" />
          Runnable
        </Pill>
        <Pill variant="muted">Revision {capability.identity.revision}</Pill>
        {capability.source === 'global' ? <Pill variant="muted">Shipped</Pill> : null}
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
