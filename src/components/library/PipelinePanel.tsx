'use client';

// The Library's inventory of published pipelines.
//
// A pipeline is not an asset — it is a `brand_profiles.canvas_workflows` row somebody
// published — so this is a panel over a different store, the same exception Typography is.
// What it answers is what no list of names could: which ports to feed, what comes back, and
// whether the thing can actually run today.
//
// Read-only on purpose. Loading a pipeline onto a canvas belongs to the canvas's own
// workflow loader, which already does it; a second half-wired "open" here would be a link
// that lands somewhere with no pipeline in it.

import type { PipelineCapabilityV2, PipelineManifest } from '@continuum/contracts';
import { Check, Copy, Play, Workflow, X } from 'lucide-react';
import { useState } from 'react';
import { PipelineContract } from '@/components/ai-studio/PipelineContract';
import { PipelineInvocationForm } from '@/components/ai-studio/PipelineInvocationForm';
import { Button } from '@/components/ui/button';
import { useBrandPipelineManifests, usePipelineCapabilities } from '@/lib/ai-studio/pipelines';

function CopyIdButton({ pipelineId }: { pipelineId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 shrink-0 px-2 text-xs"
      onClick={() => {
        void navigator.clipboard.writeText(pipelineId).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
      {copied ? 'Copied' : 'Copy ID'}
    </Button>
  );
}

function isV2(manifest: PipelineManifest | PipelineCapabilityV2): manifest is PipelineCapabilityV2 {
  return 'contract_version' in manifest && manifest.contract_version === 2;
}

function PipelineCard({
  brandId,
  manifest,
}: {
  brandId: string;
  manifest: PipelineManifest | PipelineCapabilityV2;
}) {
  const [showSetup, setShowSetup] = useState(false);
  const runnable = isV2(manifest);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-subtle bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{manifest.name}</p>
        <CopyIdButton pipelineId={manifest.pipeline_id} />
      </div>
      <PipelineContract manifest={manifest} />
      {runnable ? (
        <>
          <Button
            type="button"
            size="sm"
            variant={showSetup ? 'ghost' : 'outline'}
            className="self-start"
            onClick={() => setShowSetup((open) => !open)}
          >
            {showSetup ? (
              <X className="size-3.5" aria-hidden />
            ) : (
              <Play className="size-3.5" aria-hidden />
            )}
            {showSetup ? 'Close setup' : 'Set up run'}
          </Button>
          {showSetup ? <PipelineInvocationForm brandId={brandId} capability={manifest} /> : null}
        </>
      ) : null}
    </div>
  );
}

export function PipelinePanel({ brandId }: { brandId: string }) {
  const capabilitiesQuery = usePipelineCapabilities(brandId);
  const manifestsQuery = useBrandPipelineManifests(brandId);
  const capabilities = capabilitiesQuery.data ?? [];
  const capabilityIds = new Set(capabilities.map((capability) => capability.pipeline_id));
  const legacy = (manifestsQuery.data ?? []).filter(
    (manifest) => !capabilityIds.has(manifest.pipeline_id),
  );
  const manifests: Array<PipelineManifest | PipelineCapabilityV2> = [...capabilities, ...legacy];
  const isLoading =
    manifests.length === 0 && (capabilitiesQuery.isLoading || manifestsQuery.isLoading);
  const isError = capabilitiesQuery.isError && manifestsQuery.isError;

  if (isLoading) {
    return (
      <p className="px-1 py-8 text-center text-sm text-muted-foreground">Reading pipelines…</p>
    );
  }

  if (isError) {
    return (
      <p className="px-1 py-8 text-center text-sm text-muted-foreground">
        Could not read your pipelines. Check your connection and try again.
      </p>
    );
  }

  if (manifests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
        <Workflow className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">No pipelines published yet</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Build a canvas in the Studio, leave a required input unwired — a prompt or a reference
          image — then Save and choose Pipeline. That unwired handle becomes the port a caller
          feeds.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {manifests.map((manifest) => (
        <PipelineCard key={manifest.pipeline_id} brandId={brandId} manifest={manifest} />
      ))}
    </div>
  );
}
