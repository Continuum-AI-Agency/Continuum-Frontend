'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { MetaSelectableAssetsTree } from '@/components/integrations/MetaSelectableAssetsTree';
import { Pill } from '@/components/kibo-ui/pill';
import { PLATFORMS, type PlatformKey } from '@/components/onboarding/platforms';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/ToastProvider';
import { useMetaAutoResync } from '@/hooks/useMetaAutoResync';
import { applyBrandProfileIntegrationAccounts } from '@/lib/api/integrations';
import { runStrategicAnalysis } from '@/lib/api/strategicAnalyses.client';
import { mapIntegrationTypeToPlatformKey } from '@/lib/integrations/platform';
import {
  getSelectableAssetLabel,
  getSelectableAssetsFlatList,
  getSelectableAssetsFlatListForProvider,
} from '@/lib/integrations/selectableAssets';
import type { SelectableAsset, SelectableAssetsResponse } from '@/lib/schemas/integrations';

type Props = {
  brandProfileId: string;
  selectableAssetsResponse: SelectableAssetsResponse;
  assignedIntegrationAccountIds: string[];
};

const formSchema = z.object({
  selected: z.record(z.string(), z.boolean()),
});
type FormValues = z.infer<typeof formSchema>;

function groupSelectableAssetsByPlatform(
  assets: SelectableAsset[],
): Record<PlatformKey, SelectableAsset[]> {
  const grouped = PLATFORMS.reduce(
    (acc, { key }) => {
      acc[key] = [];
      return acc;
    },
    {} as Record<PlatformKey, SelectableAsset[]>,
  );

  assets.forEach((asset) => {
    const platformKey = mapIntegrationTypeToPlatformKey(asset.type);
    if (!platformKey) return;
    grouped[platformKey].push(asset);
  });

  return grouped;
}

function ProviderPlatformList({
  assets,
  selected,
  onToggle,
  disabled,
}: {
  assets: SelectableAsset[];
  selected: Record<string, boolean>;
  onToggle: (integrationAccountId: string, checked: boolean) => void;
  disabled: boolean;
}) {
  const grouped = useMemo(() => groupSelectableAssetsByPlatform(assets), [assets]);
  const orderedPlatforms = useMemo(
    () => PLATFORMS.filter(({ key }) => grouped[key]?.length),
    [grouped],
  );
  const unmappedAssets = useMemo(
    () => assets.filter((asset) => !mapIntegrationTypeToPlatformKey(asset.type)),
    [assets],
  );

  if (assets.length === 0) {
    return <p className="text-sm text-muted-foreground">No accounts found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {orderedPlatforms.map(({ key, label }) => {
        const platformAssets = grouped[key] ?? [];
        return (
          <section key={key} className="space-y-3">
            <p className="text-base font-medium text-primary">{label}</p>
            <div className="border-subtle overflow-hidden rounded-lg border bg-surface">
              {platformAssets.map((asset) => {
                const integrationAccountId = asset.integration_account_id;
                const checked = integrationAccountId
                  ? Boolean(selected[integrationAccountId])
                  : false;
                const rowDisabled = disabled || !integrationAccountId;
                return (
                  <div
                    key={asset.asset_pk}
                    className="border-subtle border-t px-3 py-2 first:border-t-0"
                  >
                    <label
                      htmlFor={asset.asset_pk}
                      className={`text-sm ${rowDisabled ? 'text-muted-foreground' : ''}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            id={asset.asset_pk}
                            checked={checked}
                            disabled={rowDisabled}
                            onCheckedChange={(value) =>
                              integrationAccountId
                                ? onToggle(integrationAccountId, value === true)
                                : undefined
                            }
                          />
                          <span className="truncate">{getSelectableAssetLabel(asset)}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Pill variant="muted">{asset.type}</Pill>
                          {!integrationAccountId ? (
                            <span className="text-xs text-warning">Not ready</span>
                          ) : null}
                        </span>
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {unmappedAssets.length > 0 ? (
        <section className="space-y-3">
          <p className="text-base font-medium text-primary">Other</p>
          <div className="border-subtle overflow-hidden rounded-lg border bg-surface">
            {unmappedAssets.map((asset) => {
              const integrationAccountId = asset.integration_account_id;
              const checked = integrationAccountId
                ? Boolean(selected[integrationAccountId])
                : false;
              const rowDisabled = disabled || !integrationAccountId;
              return (
                <div
                  key={asset.asset_pk}
                  className="border-subtle border-t px-3 py-2 first:border-t-0"
                >
                  <label
                    htmlFor={asset.asset_pk}
                    className={`text-sm ${rowDisabled ? 'text-muted-foreground' : ''}`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 min-w-0">
                        <Checkbox
                          id={asset.asset_pk}
                          checked={checked}
                          disabled={rowDisabled}
                          onCheckedChange={(value) =>
                            integrationAccountId
                              ? onToggle(integrationAccountId, value === true)
                              : undefined
                          }
                        />
                        <span className="truncate">{getSelectableAssetLabel(asset)}</span>
                      </span>
                      <Pill variant="muted">{asset.type}</Pill>
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function BrandAssetsForm({
  brandProfileId,
  selectableAssetsResponse,
  assignedIntegrationAccountIds,
}: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const formatDate = (dateString: string) => {
    if (!mounted) return '—';
    return new Date(dateString).toLocaleString();
  };

  const selectableAssets = useMemo(() => {
    return getSelectableAssetsFlatList(selectableAssetsResponse);
  }, [selectableAssetsResponse]);

  // #154 fingerprint: Meta connected (some Meta asset present) but no ad account.
  const metaConnectedButNoAdAccounts = useMemo(() => {
    let hasMetaAsset = false;
    let hasMetaAdAccount = false;
    for (const asset of selectableAssets) {
      if (asset.type.startsWith('meta_')) {
        hasMetaAsset = true;
        if (asset.type === 'meta_ad_account') hasMetaAdAccount = true;
      }
    }
    return hasMetaAsset && !hasMetaAdAccount;
  }, [selectableAssets]);

  const { isResyncing, resyncError, triggerResync } = useMetaAutoResync({
    enabled: mounted,
    isMetaEmpty: metaConnectedButNoAdAccounts,
    onResynced: () => {
      router.refresh();
    },
  });
  const assignedSet = useMemo(
    () => new Set(assignedIntegrationAccountIds),
    [assignedIntegrationAccountIds],
  );

  const defaultSelected: Record<string, boolean> = useMemo(() => {
    const selectedMap: Record<string, boolean> = {};
    selectableAssets.forEach((asset) => {
      if (!asset.integration_account_id) return;
      selectedMap[asset.integration_account_id] = assignedSet.has(asset.integration_account_id);
    });
    return selectedMap;
  }, [assignedSet, selectableAssets]);

  const [serverError, setServerError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const [isRunningAnalysis, startAnalysisTransition] = useTransition();

  const { show } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { selected: defaultSelected },
  });

  const selected = form.watch('selected');
  function handleToggle(key: string, checked: boolean) {
    form.setValue(
      'selected',
      { ...selected, [key]: checked },
      { shouldDirty: true, shouldTouch: true },
    );
  }

  const providers = selectableAssetsResponse.providers ?? {};
  const providerKeys = Object.keys(providers);
  const hasProviderBuckets = providerKeys.length > 0;
  const metaProvider = providers.meta;
  const googleProvider = providers.google;
  const otherProviders = providerKeys
    .filter((key) => key !== 'meta' && key !== 'google')
    .map((key) => ({ key, data: providers[key] }))
    .filter((entry): entry is { key: string; data: NonNullable<typeof entry.data> } =>
      Boolean(entry.data),
    );

  const metaHierarchy = metaProvider?.hierarchy?.meta;

  const unassignableCount = useMemo(
    () => selectableAssets.filter((asset) => !asset.integration_account_id).length,
    [selectableAssets],
  );

  async function onSubmit(values: FormValues) {
    setServerError(undefined);
    const selectedIntegrationAccountIds = Object.entries(values.selected)
      .filter(([, isSelected]) => Boolean(isSelected))
      .map(([integrationAccountId]) => integrationAccountId);
    const previous = form.getValues();
    startTransition(async () => {
      try {
        const result = await applyBrandProfileIntegrationAccounts({
          brandId: brandProfileId,
          integrationAccountIds: selectedIntegrationAccountIds,
        });
        show({
          title: 'Assignments saved',
          description: `Linked ${result.linked} account(s).`,
          variant: 'success',
        });
      } catch (e: unknown) {
        setServerError((e as Error).message ?? 'Failed to save changes');
        form.reset(previous);
        show({ title: 'Failed to save', description: (e as Error).message, variant: 'error' });
      }
    });
  }

  const handleStrategicAnalysisRun = () => {
    startAnalysisTransition(async () => {
      try {
        const result = await runStrategicAnalysis(brandProfileId);
        const details = result.runId ?? result.taskId ?? result.status ?? undefined;
        show({
          title: 'Strategic analysis queued',
          description: details
            ? `Run reference: ${details}`
            : 'Regeneration requested for this brand.',
          variant: 'success',
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unable to start strategic analysis run.';
        show({ title: 'Run failed', description: message, variant: 'error' });
      }
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold tracking-tight">Brand Assets</h1>
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={isPending}
        >
          Save
        </button>
      </div>
      <div className="text-sm text-slate-500">
        {selectableAssetsResponse.stale ? (
          <p className="text-amber-700">
            Your integrations are marked stale. Sync your providers if accounts look out of date.
          </p>
        ) : null}
        {isResyncing ? (
          <p className="text-slate-500">Refreshing your Meta accounts…</p>
        ) : resyncError ? (
          <p className="text-red-700">
            Couldn&apos;t refresh Meta accounts. {resyncError}{' '}
            <button type="button" className="underline" onClick={triggerResync}>
              Retry
            </button>
          </p>
        ) : metaConnectedButNoAdAccounts ? (
          <p className="text-amber-700">
            Meta is connected but no ad accounts were found.{' '}
            <button type="button" className="underline" onClick={triggerResync}>
              Refresh Meta accounts
            </button>
          </p>
        ) : null}
        {unassignableCount > 0 ? (
          <p className="text-amber-700">
            {unassignableCount} connected account(s) are not ready for assignment yet.
          </p>
        ) : null}
        {selectableAssetsResponse.synced_at ? (
          <p>Last synced {formatDate(selectableAssetsResponse.synced_at)}</p>
        ) : null}
      </div>
      {serverError ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {serverError}
        </div>
      ) : null}
      <div className="flex flex-col gap-8">
        {selectableAssets.length === 0 ? (
          <p className="text-sm text-slate-500">
            No connected accounts available yet. Connect providers from your personal integrations
            first.
          </p>
        ) : (
          <>
            {hasProviderBuckets ? (
              <>
                {metaProvider ? (
                  <section className="space-y-3">
                    <h2 className="text-lg font-medium">Meta</h2>
                    {metaHierarchy ? (
                      <MetaSelectableAssetsTree
                        hierarchy={metaHierarchy}
                        selectedByIntegrationAccountId={selected}
                        onToggleIntegrationAccountId={handleToggle}
                        disabled={isPending}
                      />
                    ) : null}
                    {!metaHierarchy ? (
                      <ProviderPlatformList
                        assets={getSelectableAssetsFlatListForProvider(
                          selectableAssetsResponse,
                          'meta',
                        )}
                        selected={selected}
                        onToggle={handleToggle}
                        disabled={isPending}
                      />
                    ) : null}
                  </section>
                ) : null}

                {googleProvider ? (
                  <section className="space-y-3">
                    <h2 className="text-lg font-medium">Google</h2>
                    <ProviderPlatformList
                      assets={getSelectableAssetsFlatListForProvider(
                        selectableAssetsResponse,
                        'google',
                      )}
                      selected={selected}
                      onToggle={handleToggle}
                      disabled={isPending}
                    />
                  </section>
                ) : null}

                {otherProviders.map(({ key, data }) => (
                  <section key={key} className="space-y-3">
                    <h2 className="text-lg font-medium">{key}</h2>
                    <ProviderPlatformList
                      assets={getSelectableAssetsFlatListForProvider(selectableAssetsResponse, key)}
                      selected={selected}
                      onToggle={handleToggle}
                      disabled={isPending}
                    />
                  </section>
                ))}
              </>
            ) : (
              <section className="space-y-3">
                <h2 className="text-lg font-medium">Accounts</h2>
                <ProviderPlatformList
                  assets={selectableAssets}
                  selected={selected}
                  onToggle={handleToggle}
                  disabled={isPending}
                />
              </section>
            )}
          </>
        )}
      </div>

      <div className="rounded-lg border border-slate-200/40 bg-slate-950/40 p-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Strategic analyses</h2>
            <p className="text-sm text-slate-300">
              Trigger a manual regeneration when no strategic analysis data exists for this brand.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStrategicAnalysisRun}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isRunningAnalysis}
          >
            {isRunningAnalysis ? 'Queuing...' : 'Run analysis'}
          </button>
        </div>
      </div>
    </form>
  );
}
