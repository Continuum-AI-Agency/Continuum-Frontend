'use client';

import { Accordion } from '@base-ui/react/accordion';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Pill } from '@/components/kibo-ui/pill';
import { Checkbox } from '@/components/ui/checkbox';
import { isReadOnlyMetaRole } from '@/lib/integrations/metaRole';
import { getSelectableAssetLabel } from '@/lib/integrations/selectableAssets';
import type { MetaSelectableHierarchy, SelectableAsset } from '@/lib/schemas/integrations';
import { cn } from '@/lib/utils';

type SelectedByIntegrationAccountId = Record<string, boolean>;

type Props = {
  hierarchy: MetaSelectableHierarchy;
  selectedByIntegrationAccountId: SelectedByIntegrationAccountId;
  onToggleIntegrationAccountId: (integrationAccountId: string, checked: boolean) => void;
  disabled?: boolean;
};

function getAssetRowKey(asset: SelectableAsset): string {
  return asset.integration_account_id ?? asset.asset_pk;
}

function SelectableAssetRow({
  asset,
  selectedByIntegrationAccountId,
  onToggleIntegrationAccountId,
  disabled,
  seenKeys,
}: {
  asset: SelectableAsset;
  selectedByIntegrationAccountId: SelectedByIntegrationAccountId;
  onToggleIntegrationAccountId: (integrationAccountId: string, checked: boolean) => void;
  disabled: boolean;
  seenKeys: Set<string>;
}) {
  const tUi = useTranslations('common');

  const key = getAssetRowKey(asset);
  if (seenKeys.has(key)) return null;
  seenKeys.add(key);

  const integrationAccountId = asset.integration_account_id;
  const checked = integrationAccountId
    ? Boolean(selectedByIntegrationAccountId[integrationAccountId])
    : false;
  const isDisabled = disabled || !integrationAccountId;

  return (
    <div className="border-subtle border-t px-3 py-2">
      <div className={cn('text-sm', isDisabled && 'text-muted-foreground')}>
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <Checkbox
              checked={checked}
              disabled={isDisabled}
              onCheckedChange={(value) => {
                if (!integrationAccountId) return;
                onToggleIntegrationAccountId(integrationAccountId, value === true);
              }}
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
      </div>
    </div>
  );
}

function AssetsList({
  title,
  assets,
  selectedByIntegrationAccountId,
  onToggleIntegrationAccountId,
  disabled,
  seenKeys,
}: {
  title: string;
  assets: SelectableAsset[];
  selectedByIntegrationAccountId: SelectedByIntegrationAccountId;
  onToggleIntegrationAccountId: (integrationAccountId: string, checked: boolean) => void;
  disabled: boolean;
  seenKeys: Set<string>;
}) {
  if (assets.length === 0) return null;
  return (
    <div className="border-subtle rounded-lg border bg-surface">
      <div className="px-3 py-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
      <div>
        {assets.map((asset) => (
          <SelectableAssetRow
            key={asset.asset_pk}
            asset={asset}
            selectedByIntegrationAccountId={selectedByIntegrationAccountId}
            onToggleIntegrationAccountId={onToggleIntegrationAccountId}
            disabled={disabled}
            seenKeys={seenKeys}
          />
        ))}
      </div>
    </div>
  );
}

export function MetaSelectableAssetsTree({
  hierarchy,
  selectedByIntegrationAccountId,
  onToggleIntegrationAccountId,
  disabled = false,
}: Props) {
  const uiText = useTranslations('common');
  const integrations = hierarchy.integrations ?? [];
  if (integrations.length === 0) {
    return <span className="text-sm text-muted-foreground">{uiText('m_2ecbd8e264')}</span>;
  }

  const seenKeys = new Set<string>();

  return (
    <div className="flex flex-col gap-4">
      {integrations.map((integration) => {
        const businesses = integration.businesses ?? [];
        if (businesses.length === 0) return null;

        return (
          <div key={integration.integration_id}>
            <Accordion.Root multiple className="flex flex-col gap-2">
              {businesses.map((business, index) => {
                const businessKey = `${integration.integration_id}:${business.business_id ?? 'none'}:${index}`;
                const businessLabel =
                  business.business_name?.trim() ||
                  business.business_id ||
                  uiText('metaBusinessFallback');

                return (
                  <Accordion.Item
                    key={businessKey}
                    value={businessKey}
                    className="border-subtle overflow-hidden rounded-lg border bg-surface"
                  >
                    <Accordion.Header>
                      <Accordion.Trigger className="text-foreground group flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="truncate text-sm font-medium">{businessLabel}</span>
                          {business.business_id ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {uiText('m_3c6b9e527e')}
                              {business.business_id}
                            </span>
                          ) : null}
                        </span>
                        <ChevronDown
                          className="text-secondary shrink-0 transition-transform group-data-[state=open]:rotate-180"
                          aria-hidden="true"
                        />
                      </Accordion.Trigger>
                    </Accordion.Header>

                    <Accordion.Panel className="border-subtle border-t px-3 py-3">
                      <div className="flex flex-col gap-3">
                        {(business.ad_accounts ?? []).length > 0 ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {uiText('ad_accounts_f3e56c3')}
                            </span>
                            <Accordion.Root multiple className="flex flex-col gap-2">
                              {(business.ad_accounts ?? []).map((adAccount) => {
                                const adAccountKey = `${businessKey}:ad:${adAccount.ad_account_id}`;
                                const adAccountLabel = adAccount.ad_account
                                  ? getSelectableAssetLabel(adAccount.ad_account)
                                  : adAccount.ad_account_id;

                                const adAccountIntegrationAccountId =
                                  adAccount.ad_account?.integration_account_id ?? null;
                                const adAccountChecked = adAccountIntegrationAccountId
                                  ? Boolean(
                                      selectedByIntegrationAccountId[adAccountIntegrationAccountId],
                                    )
                                  : false;
                                const adAccountDisabled =
                                  disabled || !adAccountIntegrationAccountId;

                                return (
                                  <Accordion.Item
                                    key={adAccountKey}
                                    value={adAccountKey}
                                    className="border-subtle overflow-hidden rounded-lg border bg-default"
                                  >
                                    <Accordion.Header className="px-3 py-2">
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          checked={adAccountChecked}
                                          disabled={adAccountDisabled}
                                          onCheckedChange={(value) => {
                                            if (!adAccountIntegrationAccountId) return;
                                            onToggleIntegrationAccountId(
                                              adAccountIntegrationAccountId,
                                              value === true,
                                            );
                                          }}
                                        />
                                        <Accordion.Trigger className="text-foreground group flex w-full flex-1 items-center justify-between gap-2 text-left">
                                          <span className="flex min-w-0 flex-col gap-1">
                                            <span className="flex items-center gap-2">
                                              <span className="truncate text-sm font-medium">
                                                {adAccountLabel}
                                              </span>
                                              <Pill variant="muted">{uiText('m_865e46c856')}</Pill>
                                              {isReadOnlyMetaRole(adAccount.ad_account?.role) ? (
                                                <Pill variant="warning">
                                                  {uiText('read_only_72bb908')}
                                                </Pill>
                                              ) : null}
                                            </span>
                                            <span className="truncate text-xs text-muted-foreground">
                                              {uiText('m_1395b4b164')}
                                              {adAccount.ad_account_id}
                                            </span>
                                          </span>
                                          <ChevronDown
                                            className="text-secondary shrink-0 transition-transform group-data-[state=open]:rotate-180"
                                            aria-hidden="true"
                                          />
                                        </Accordion.Trigger>
                                      </div>
                                    </Accordion.Header>

                                    <Accordion.Panel className="border-subtle border-t px-3 py-3">
                                      <div className="flex flex-col gap-3">
                                        <AssetsList
                                          title={uiText('m_600584c2d5')}
                                          assets={adAccount.pages ?? []}
                                          selectedByIntegrationAccountId={
                                            selectedByIntegrationAccountId
                                          }
                                          onToggleIntegrationAccountId={
                                            onToggleIntegrationAccountId
                                          }
                                          disabled={disabled}
                                          seenKeys={seenKeys}
                                        />
                                        <AssetsList
                                          title={uiText('m_482e7a5dc5')}
                                          assets={adAccount.instagram_accounts ?? []}
                                          selectedByIntegrationAccountId={
                                            selectedByIntegrationAccountId
                                          }
                                          onToggleIntegrationAccountId={
                                            onToggleIntegrationAccountId
                                          }
                                          disabled={disabled}
                                          seenKeys={seenKeys}
                                        />
                                        <AssetsList
                                          title={uiText('m_af6a10e434')}
                                          assets={adAccount.threads_accounts ?? []}
                                          selectedByIntegrationAccountId={
                                            selectedByIntegrationAccountId
                                          }
                                          onToggleIntegrationAccountId={
                                            onToggleIntegrationAccountId
                                          }
                                          disabled={disabled}
                                          seenKeys={seenKeys}
                                        />
                                      </div>
                                    </Accordion.Panel>
                                  </Accordion.Item>
                                );
                              })}
                            </Accordion.Root>
                          </div>
                        ) : null}

                        <AssetsList
                          title={uiText('m_5c72b41a55')}
                          assets={business.pages_without_ad_account ?? []}
                          selectedByIntegrationAccountId={selectedByIntegrationAccountId}
                          onToggleIntegrationAccountId={onToggleIntegrationAccountId}
                          disabled={disabled}
                          seenKeys={seenKeys}
                        />
                        <AssetsList
                          title={uiText('m_bb4fbbf0de')}
                          assets={business.instagram_accounts_without_ad_account ?? []}
                          selectedByIntegrationAccountId={selectedByIntegrationAccountId}
                          onToggleIntegrationAccountId={onToggleIntegrationAccountId}
                          disabled={disabled}
                          seenKeys={seenKeys}
                        />
                        <AssetsList
                          title={uiText('m_16999620ae')}
                          assets={business.threads_accounts_without_ad_account ?? []}
                          selectedByIntegrationAccountId={selectedByIntegrationAccountId}
                          onToggleIntegrationAccountId={onToggleIntegrationAccountId}
                          disabled={disabled}
                          seenKeys={seenKeys}
                        />
                      </div>
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion.Root>
          </div>
        );
      })}
    </div>
  );
}
