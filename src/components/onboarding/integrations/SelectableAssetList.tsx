import React, { useMemo, useRef } from "react";
import { Badge, Card, Checkbox, Flex, Text } from "@radix-ui/themes";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { PlatformKey } from "../platforms";
import type { SelectableAsset } from "@/lib/schemas/integrations";
import { resolveSelectableAssetLabel } from "./selectableAssetUtils";

type SelectableAssetListProps = {
  provider: PlatformKey;
  assets: SelectableAsset[];
  selectedAccountIds: Set<string>;
  onToggleAccount: (provider: PlatformKey, accountId: string, checked: boolean, label?: string | null) => void;
};

const VIRTUAL_THRESHOLD = 24;
const VIRTUAL_ESTIMATE_SIZE = 64;
const VIRTUAL_MAX_HEIGHT = 320;

export const SelectableAssetList = React.memo(function SelectableAssetList({
  provider,
  assets,
  selectedAccountIds,
  onToggleAccount,
}: SelectableAssetListProps) {
  const shouldVirtualize = typeof window !== "undefined" && assets.length > VIRTUAL_THRESHOLD;
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: assets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUAL_ESTIMATE_SIZE,
    overscan: 6,
  });

  const rows = useMemo(() => rowVirtualizer.getVirtualItems(), [rowVirtualizer]);

  const renderRow = (asset: SelectableAsset) => {
    const integrationAccountId = asset.integration_account_id;
    const disabled = !integrationAccountId;
    const selected = integrationAccountId
      ? (selectedAccountIds?.has(integrationAccountId) ?? false)
      : false;
    const assetLabel = resolveSelectableAssetLabel(asset);
    return (
      <Card variant="surface">
        <Flex justify="between" align="center" p="2" gap="2">
          <Flex align="center" gap="2" className="min-w-0">
            <Checkbox
              checked={selected}
              disabled={disabled}
              onCheckedChange={(value) => {
                if (!integrationAccountId) return;
                onToggleAccount(provider, integrationAccountId, value === true, assetLabel);
              }}
            />
            <Text size="2" className="truncate" color={disabled ? "gray" : undefined}>
              {assetLabel}
            </Text>
            <Badge color="gray" variant="soft">
              {asset.type}
            </Badge>
          </Flex>
          <Badge color="green" variant="soft">
            active
          </Badge>
        </Flex>
      </Card>
    );
  };

  if (!shouldVirtualize) {
    return (
      <Flex direction="column" gap="1">
        {assets.map(asset => (
          <React.Fragment key={asset.asset_pk}>{renderRow(asset)}</React.Fragment>
        ))}
      </Flex>
    );
  }

  return (
    <div ref={parentRef} style={{ maxHeight: VIRTUAL_MAX_HEIGHT, overflow: "auto" }} role="list">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {rows.map(row => {
          const asset = assets[row.index];
          if (!asset) return null;
          return (
            <div
              key={asset.asset_pk}
              ref={rowVirtualizer.measureElement}
              data-index={row.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
                paddingBottom: 8,
              }}
            >
              {renderRow(asset)}
            </div>
          );
        })}
      </div>
    </div>
  );
});
