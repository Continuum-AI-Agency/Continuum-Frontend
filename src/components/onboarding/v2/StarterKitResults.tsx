'use client';

import {
  type OnboardingStarterRun,
  STARTER_ATTEMPT_LIMIT,
  STARTER_CREATIVE_SLOTS,
  STARTER_ELEMENT_ROLES,
  type StarterSlotKey,
  starterProgress,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { ElementCard } from '@/components/ai-studio/elements/ElementCard';
import { Button } from '@/components/ui/button';
import { elementsQueryKey, useElements, useSignedAssetUrls } from '@/lib/ai-studio/elements';
import { STARTER_LABELS, starterStateLine } from '@/lib/onboarding/starterKit';

const ElementsPanel = dynamic(() =>
  import('@/components/ai-studio/elements/ElementsPanel').then((module) => module.ElementsPanel),
);

export function StarterKitResults({
  run,
  onRetry,
}: {
  run: OnboardingStarterRun;
  onRetry: (slots: StarterSlotKey[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { elements } = useElements(run.brandId);
  const readyElements = STARTER_ELEMENT_ROLES.map((role) =>
    run.slots[role].status === 'ready' ? run.slots[role].elementId : '',
  ).join(',');
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: elementsQueryKey(run.brandId) });
  }, [queryClient, run.brandId, readyElements]);
  const ids = Object.values(run.slots).flatMap((slot) =>
    slot.status === 'ready' && slot.assetId ? [slot.assetId] : [],
  );
  const urls = useSignedAssetUrls(run.brandId, ids);
  const progress = starterProgress(run);
  const retry = async (key: StarterSlotKey) => {
    setRetrying(true);
    setError(null);
    try {
      await onRetry([key]);
    } catch {
      setError('Could not retry this item. Please try again.');
    } finally {
      setRetrying(false);
    }
  };
  const status = (key: StarterSlotKey) => {
    const slot = run.slots[key];
    return (
      <div className="mt-2 text-xs text-muted-foreground">
        {slot.status === 'ready'
          ? 'Saved to your library'
          : slot.status === 'running'
            ? 'Creating…'
            : slot.status === 'failed'
              ? slot.error
              : 'Waiting to start'}
        {slot.status === 'failed' && slot.attempts < STARTER_ATTEMPT_LIMIT ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={retrying || progress.active}
            onClick={() => void retry(key)}
          >
            Retry {STARTER_LABELS[key].toLowerCase()}
          </Button>
        ) : null}
        {slot.status === 'failed' && slot.attempts >= STARTER_ATTEMPT_LIMIT ? (
          <p>Retry limit reached. You can still use your saved items.</p>
        ) : null}
      </div>
    );
  };
  return (
    <section className="space-y-5" aria-label="Your starter kit">
      <div>
        <p role="status" aria-live="polite" className="mb-2 text-sm">
          {starterStateLine(run)}
        </p>
        <progress
          className="h-2 w-full accent-primary"
          max={progress.total}
          value={progress.ready}
          aria-label="Starter kit items ready"
        />
        {progress.active ? (
          <p className="mt-1 text-xs text-muted-foreground">
            You can continue. We’ll keep saving your kit and show progress in notifications.
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STARTER_ELEMENT_ROLES.map((role) => {
          const slot = run.slots[role];
          const element =
            slot.status === 'ready'
              ? elements.find((element) => element.id === slot.elementId)
              : undefined;
          return (
            <div key={role}>
              <h2 className="mb-2 text-xs font-medium">{STARTER_LABELS[role]}</h2>
              {element ? (
                <ElementCard
                  element={element}
                  previewUrl={slot.assetId ? urls[slot.assetId] : undefined}
                  onSelect={setSelected}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-muted/50 text-xs text-muted-foreground">
                  {slot.status === 'failed' ? 'Needs attention' : 'Preparing…'}
                </div>
              )}
              {slot.source === 'concept' ? (
                <p className="mt-1 text-xs">Concept · not a catalog product</p>
              ) : role === 'character' && element ? (
                <p className="mt-1 text-xs">Fictional audience character</p>
              ) : null}
              {status(role)}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STARTER_CREATIVE_SLOTS.map((key) => {
          const slot = run.slots[key];
          const url = slot.status === 'ready' && slot.assetId ? urls[slot.assetId] : null;
          return (
            <div key={key}>
              {url ? (
                <img
                  src={url}
                  alt={STARTER_LABELS[key]}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center bg-muted/50 text-xs text-muted-foreground">
                  {slot.status === 'failed'
                    ? 'Needs attention'
                    : 'Your kit will guide this creative'}
                </div>
              )}
              <h2 className="mt-2 text-xs font-medium">{STARTER_LABELS[key]}</h2>
              {slot.missingRoles.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Made without{' '}
                  {slot.missingRoles.map((role) => STARTER_LABELS[role].toLowerCase()).join(', ')}.
                </p>
              ) : null}
              {status(key)}
            </div>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {selected ? (
        <ElementsPanel
          open
          brandId={run.brandId}
          initialElementId={selected}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        />
      ) : null}
    </section>
  );
}
