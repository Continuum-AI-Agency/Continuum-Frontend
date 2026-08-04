import type {
  AdSetSnapshot,
  OptimizerAdsetInventoryItem,
  OptimizerAdsetInventoryLifecycle,
  PortfolioAdset,
} from '@continuum/contracts';

export type PortfolioPickerEntity = {
  id: string;
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  currentBudget: number;
  windows: AdSetSnapshot['windows'] | null;
  adCount: number;
  kpiField: AdSetSnapshot['kpiField'] | null;
  freezeReason: AdSetSnapshot['freezeReason'] | null;
  budgetType: AdSetSnapshot['budgetType'];
  optimizable: boolean;
  canAdd: boolean;
  providerLifecycle: OptimizerAdsetInventoryLifecycle;
  providerStatus: string | null;
};

type BuildPortfolioPickerEntitiesInput = {
  snapshots: readonly AdSetSnapshot[];
  inventory: readonly OptimizerAdsetInventoryItem[];
  enrolled: readonly PortfolioAdset[];
};

function preferredName(
  snapshot: AdSetSnapshot | undefined,
  inventory: OptimizerAdsetInventoryItem | undefined,
  enrolled: PortfolioAdset | undefined,
  id: string,
): string {
  return snapshot?.name?.trim() || inventory?.name?.trim() || enrolled?.adset_name?.trim() || id;
}

/** Joins three truths without changing any of them: live engine inputs, provider inventory,
 * and durable portfolio membership. The result is UI-only and cannot pass AdSetSnapshotSchema. */
export function buildPortfolioPickerEntities({
  snapshots,
  inventory,
  enrolled,
}: BuildPortfolioPickerEntitiesInput): PortfolioPickerEntity[] {
  const snapshotsById = new Map(snapshots.map((row) => [row.id, row]));
  const inventoryById = new Map(inventory.map((row) => [row.id, row]));
  const enrolledById = new Map(enrolled.map((row) => [row.adset_id, row]));
  const ids = new Set([...snapshotsById.keys(), ...inventoryById.keys(), ...enrolledById.keys()]);

  return [...ids]
    .map((id): PortfolioPickerEntity => {
      const snapshot = snapshotsById.get(id);
      const inventoryRow = inventoryById.get(id);
      const enrolledRow = enrolledById.get(id);
      const providerLifecycle = inventoryRow?.lifecycle ?? (snapshot ? 'active' : 'unknown');
      const currentBudget = snapshot?.currentBudget ?? inventoryRow?.currentBudget ?? 0;
      const optimizable = Boolean(
        snapshot && snapshot.status !== 'frozen' && snapshot.freeze !== true && currentBudget > 0,
      );

      return {
        id,
        name: preferredName(snapshot, inventoryRow, enrolledRow, id),
        campaignId: snapshot?.campaignId ?? inventoryRow?.campaignId ?? null,
        campaignName: snapshot?.campaignName ?? inventoryRow?.campaignName ?? null,
        currentBudget,
        windows: snapshot?.windows ?? null,
        adCount: snapshot?.adCount ?? inventoryRow?.adCount ?? 0,
        kpiField: snapshot?.kpiField ?? null,
        freezeReason: snapshot?.freezeReason ?? null,
        budgetType: snapshot?.budgetType,
        optimizable,
        canAdd: providerLifecycle === 'active' || providerLifecycle === 'recoverable',
        providerLifecycle,
        providerStatus:
          inventoryRow?.effectiveStatus ??
          inventoryRow?.configuredStatus ??
          (snapshot ? 'ACTIVE' : null),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}
