# Onboarding Flow Refactor Plan

## Scope
Refactor `src/components/onboarding/OnboardingFlow.tsx` into smaller components and hooks while preserving behavior, selection state, and trigger cadence. This plan includes required behavior fixes, test coverage, and Bun runtime usage.

## Behavior Invariants (Must Hold)
- New data triumphs; cached data remains visible until rehydrate.
- Selection state persists across refetch/resync.
- Triggers fire exactly 3 times: post-login (lazy), refresh, post-OAuth.
- UI never clears visible assets during refetch.
- Review reflects the authoritative selectable-assets payload after hydration.

---

## Task 0 — Fix the Authoritative Empty Response Gap (Pre-Refactor)
**Goal:** Ensure successful empty `/selectable-assets` responses reconcile `state.connections` and do not leave stale connected state.

**Planned change**
- Update logic in `src/components/onboarding/OnboardingFlow.tsx` (later moved to hook in Task 3):
  - After `selectableAssetsQuery.isSuccess`:
    - If payload is successful and empty, clear `accounts` + `integrationIds` for providers present in the response (or all relevant providers if response implies “none”).
    - Derive `connected` from current `accounts`/`integrationIds` once hydrated (avoid keeping `existing.connected`).

**Tests (Bun)**
- `tests/onboarding/selectable-assets-merge.test.ts`
  - Case 1: payload has assets → connections updated.
  - Case 2: payload empty → connections cleared for relevant providers.
  - Case 3: payload empty before hydration → connections remain unchanged.

---

## Task 1 — Extract ProviderDetailsCard / MetaBundlesAccordion / SelectableAssetList
**Goal:** Reduce render complexity without changing behavior; keep selection state consistent.

**New files**
- `src/components/onboarding/integrations/ProviderDetailsCard.tsx`
- `src/components/onboarding/integrations/MetaBundlesAccordion.tsx`
- `src/components/onboarding/integrations/SelectableAssetList.tsx`

**Props (explicit, stable)**
```ts
type ProviderDetailsCardProps = {
  provider: PlatformKey;
  connection?: OnboardingState["connections"][PlatformKey];
  selectableAssets: SelectableAsset[];
  metaBundles: ReturnType<typeof getMetaSelectableAdAccountBundles> | null;
  selectedAccountIdsByKey: Record<PlatformKey, Set<string>>;
  isHydrated: boolean;
  isPending: boolean;
  isAgentRunning: boolean;
  onToggleAccount: (provider: PlatformKey, accountId: string, checked: boolean, label?: string | null) => void;
  onToggleAssets: (assets: SelectableAsset[], checked: boolean) => void;
};

type MetaBundlesAccordionProps = {
  bundles: ReturnType<typeof getMetaSelectableAdAccountBundles>;
  selectedAccountIdsByKey: Record<PlatformKey, Set<string>>;
  onToggleAssets: (assets: SelectableAsset[], checked: boolean) => void;
  onToggleAccount: (provider: PlatformKey, accountId: string, checked: boolean, label?: string | null) => void;
};

type SelectableAssetListProps = {
  provider: PlatformKey;
  assets: SelectableAsset[];
  selectedAccountIds: Set<string>;
  onToggleAccount: (provider: PlatformKey, accountId: string, checked: boolean, label?: string | null) => void;
};
```

**Behavior guardrails**
- Parent still decides fallback vs. selectable assets based on `isHydrated`.
- Children are `React.memo` and never mutate state.

**Tests (Bun)**
- `tests/onboarding/provider-details-badges.test.ts`
  - Verify badge state (selected counts, indeterminate, unavailable).

---

## Task 2 — Extract ConnectionsPanel + IntegrationsStep
**Goal:** Move heavy integrations UI out of the root to reduce memory pressure and rerenders.

**New files**
- `src/components/onboarding/integrations/ConnectionsPanel.tsx`
- `src/components/onboarding/steps/IntegrationsStep.tsx`

**Props (minimal)**
```ts
type IntegrationsStepProps = {
  state: OnboardingState;
  selectableAssets: SelectableAsset[];
  selectableAssetsData: SelectableAssetsResponse | null;
  selectedAccountIdsByKey: Record<PlatformKey, Set<string>>;
  isHydrated: boolean;
  isPending: boolean;
  isAgentRunning: boolean;
  onConnectGroup: (group: "google" | "facebook") => void;
  onDisconnectGroup: (group: "google" | "facebook") => void;
  onResyncGroup: (group: "google" | "facebook") => void;
  onRefreshAll: () => void;
  onToggleAccount: (provider: PlatformKey, accountId: string, checked: boolean, label?: string | null) => void;
  onToggleAssets: (assets: SelectableAsset[], checked: boolean) => void;
};
```

**Behavior**
- All state remains in `OnboardingFlow`.
- IntegrationsStep is a pure view with stable callbacks.

**Tests (Bun)**
- `tests/onboarding/integrations-step.test.tsx`
  - Verifies buttons render and are enabled/disabled consistently.

---

## Task 3 — Extract `useSelectableAssetsState` Hook
**Goal:** Isolate cache, hydration, merge logic to prevent regressions and simplify `OnboardingFlow`.

**New file**
- `src/components/onboarding/hooks/useSelectableAssetsState.ts`

**Signature**
```ts
type UseSelectableAssetsStateParams = {
  currentUserId?: string;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  selectedAccountIdsByKeyRef: React.MutableRefObject<Record<PlatformKey, Set<string>>>;
};

type UseSelectableAssetsStateResult = {
  selectableAssetsQuery: ReturnType<typeof useSelectableAssets>;
  selectableAssetsFlatList: SelectableAsset[];
  selectableAccountIdToPlatformKey: Map<string, PlatformKey>;
  isHydrated: boolean;
  refetchSelectableAssets: () => Promise<void>;
};
```

**Responsibilities**
- Own hydration flag + reset (if brandId changes or on unmount).
- Merge selectable-assets into `state.connections` (current logic).
- Apply empty-response reconciliation (Task 0).
- Expose stable refetch API.

**Tests (Bun)**
- `tests/onboarding/selectable-assets-hook.test.ts`
  - Validates merge paths and empty-payload reconciliation.

---

## Task 4 — Mount Only the Active Tab
**Goal:** Avoid hidden heavy trees consuming memory; preserve state across tab switches.

**Files**
- `src/components/onboarding/OnboardingFlow.tsx`
- Optional: `src/components/ui/StableTabs.tsx` if it can support lazy mount

**Approach**
- If `StableTabs` lacks lazy mount, gate rendering by active tab in `OnboardingFlow`.
- Keep `useForm`, selections, and state in the parent so tab switching never resets state.

**Tests (Bun)**
- `tests/onboarding/onboarding-tabs-persistence.test.tsx`
  - Assert form values and selections persist after switching tabs.

---

## Task 5 — Optional Virtualization for Large Asset Lists
**Goal:** Reduce DOM size and memory when asset counts are large.

**Files**
- `src/components/onboarding/integrations/SelectableAssetList.tsx`
- `src/components/onboarding/integrations/MetaBundlesAccordion.tsx`

**Approach**
- Use `@tanstack/react-virtual` to render only visible rows.
- Keep `asset_pk` as stable key; preserve checkbox state with controlled sets.

**Tests (Bun)**
- `tests/onboarding/selectable-assets-virtualized.test.tsx`
  - Ensures selection callbacks still fire for offscreen items.

---

## Audit (Triggers + State Consistency)
- **Triggers**
  - Initial fetch happens once after Supabase user is available (lazy).
  - Refresh button triggers `syncIntegrationAccountsAction` then a non-blocking selectable-assets refetch.
  - OAuth success triggers the same flow.
  - These are already consistent with the 3 required cases.

- **State flow**
  - Selections are preserved across refetch and resync (good).
  - UI keeps cached data visible until hydration (good).
  - Gap: successful empty `/selectable-assets` responses never reconcile `state.connections`, so Review can still show “connected” based on stale state even after hydration. This violates “new data triumphs.”

**Fixes to apply before (or during) the refactor**
1) Empty response reconciliation (Medium severity fix)
   - Make `/selectable-assets` authoritative after the first successful response—even if it’s empty.
   - On success with no assets, explicitly clear accounts/integrationIds for providers represented in the response (or all providers if response implies “none”).
   - Keep selections as they were until the first successful response (current behavior).
   - After hydration, the empty response should drive `connected=false` for those providers.

2) Hydration reset for brand switch (Low severity fix)
   - Reset `hasSelectableAssetsHydrated` when `brandId` changes so a brand swap doesn’t hide fallback lists (if brand switching is possible while this component stays mounted).

---

## Bun Runtime Usage
- Use `bun test` for fast execution of new test files.
- Use `bun test --coverage` to keep merge/hydration paths covered.
- Optional: run with `bun --watch` during refactor for rapid feedback loops.
- Optional: use `bun --smol` to reproduce memory pressure when investigating bloat.

## Bun Commands to Validate
1) `bun test tests/onboarding/selectable-assets-merge.test.ts`
2) `bun test tests/onboarding/integrations-step.test.tsx`
3) `bun test tests/onboarding/onboarding-tabs-persistence.test.tsx`
4) Optional: `bun test --coverage`
