'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { MetaSelectableAssetsTree } from '@/components/integrations/MetaSelectableAssetsTree';
import { Pill } from '@/components/kibo-ui/pill';
import { PLATFORMS, type PlatformKey } from '@/components/onboarding/platforms';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/ToastProvider';
import { useMetaAutoResync } from '@/hooks/useMetaAutoResync';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
import { applyBrandProfileIntegrationAccounts } from '@/lib/api/integrations';
import { runStrategicAnalysis } from '@/lib/api/strategicAnalyses.client.ts';
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
  const tUi = useTranslations('settings');
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
    return <p className="text-sm text-muted-foreground">{tUi('m_38db411381')}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {orderedPlatforms.map(({ key, label }) => {
        const platformAssets = grouped[key] ?? [];
        return (
          <section key={key} className="space-y-3">
            <p className="text-base font-medium text-foreground">{label}</p>
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
                            <span className="text-xs text-warning">{tUi('m_2b50ff807d')}</span>
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
          <p className="text-base font-medium text-foreground">{tUi('m_6e6a6f2086')}</p>
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
  const tUi = useTranslations('settings');
  const uiLocale = useLocale();
  const formatUiError = useUiErrorMessage();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const formatDate = (dateString: string) => {
    if (!mounted) return '—';
    return new Date(dateString).toLocaleString(uiLocale);
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
          title: tUi('m_8617653940'),
          description: tUi('m_89eae72f13', { count: result.linked }),
          variant: 'success',
        });
      } catch (e: unknown) {
        setServerError(formatUiError(e));
        form.reset(previous);
        show({ title: tUi('m_23778b5f7e'), description: formatUiError(e), variant: 'error' });
      }
    });
  }

  const handleStrategicAnalysisRun = () => {
    startAnalysisTransition(async () => {
      try {
        const result = await runStrategicAnalysis(brandProfileId);
        const details = result.runId ?? result.taskId ?? result.status ?? undefined;
        show({
          title: tUi('m_5b5a87753b'),
          description: details ? tUi('m_7b909403a1', { reference: details }) : tUi('m_74e8d164fb'),
          variant: 'success',
        });
      } catch (e: unknown) {
        const message = formatUiError(e);
        show({ title: tUi('m_9a731f3d6d'), description: message, variant: 'error' });
      }
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold tracking-tight">{tUi('m_d6833e3367')}</h1>
        <Button type="submit" disabled={isPending}>
          {tUi('m_efc007a393')}
        </Button>
      </div>
      <div className="text-sm text-slate-500">
        {selectableAssetsResponse.stale ? (
          <p className="text-amber-700">{tUi('m_e1c07f12a5')}</p>
        ) : null}
        {isResyncing ? (
          <p className="text-slate-500">{tUi('m_203e9def72')}</p>
        ) : resyncError ? (
          <p className="text-red-700">
            {tUi('m_13fec85ea2')} {formatUiError({ code: resyncError })}{' '}
            <button type="button" className="underline" onClick={triggerResync}>
              {tUi('m_9f5cd8a2e8')}
            </button>
          </p>
        ) : metaConnectedButNoAdAccounts ? (
          <p className="text-amber-700">
            {tUi('m_49db7187fa')}{' '}
            <button type="button" className="underline" onClick={triggerResync}>
              {tUi('m_d11f9ef6bf')}
            </button>
          </p>
        ) : null}
        {unassignableCount > 0 ? (
          <p className="text-amber-700">{tUi('m_692b41f027', { count: unassignableCount })}</p>
        ) : null}
        {selectableAssetsResponse.synced_at ? (
          <p>{tUi('m_64e7ef03dc', { date: formatDate(selectableAssetsResponse.synced_at) })}</p>
        ) : null}
      </div>
      {serverError ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {serverError}
        </div>
      ) : null}
      <div className="flex flex-col gap-8">
        {selectableAssets.length === 0 ? (
          <p className="text-sm text-slate-500">{tUi('m_9aa02ab4d3')}</p>
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
                <h2 className="text-lg font-medium">{tUi('m_36bae31694')}</h2>
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
            <h2 className="text-lg font-semibold">{tUi('m_c3ba9398c5')}</h2>
            <p className="text-sm text-slate-300">{tUi('m_01b8326d2d')}</p>
          </div>
          <Button type="button" onClick={handleStrategicAnalysisRun} disabled={isRunningAnalysis}>
            {isRunningAnalysis ? tUi('m_2aeb6d67d0') : tUi('m_546af0471c')}
          </Button>
        </div>
      </div>
    </form>
  );
}
