# Brand Switch Seam

> Single source of truth for how brand switching propagates across the client. Read this before adding a hook, store, or realtime channel that depends on the active brand.

## The rule

**Every consumer that holds brand-scoped state must reset (or invalidate) on brand switch.** Three categories of consumer; three patterns. Nothing else.

| Category | Pattern | API |
|---|---|---|
| Zustand store | Add `resetForBrandSwitch` action; register at module load | `registerBrandScopedStore({ name, reset, purge? })` from `@/lib/brands/brand-switch` |
| React Query | Include `brandId` in the query key | Standard `useQuery` / `useMutation`; the QueryClient already calls `clear()` on every switch as a safety net |
| Supabase realtime | Create the channel inside a `useEffect` with `brandId` in the dep array; return `supabase.removeChannel(ch)` from cleanup | Standard React effect pattern |
| Other (telemetry, refs, side effects) | Subscribe with `useBrandChange` or `onBrandChange` | `useBrandChange((event) => ...)` from `@/lib/brands/brand-switch` |
| Brand-scoped localStorage | Use `brandScopedStorage` (`:b:<brandId>` suffix) | `src/lib/storage/brandScopedStorage.ts` |

## The seam

Two modules, one event.

- **`src/lib/storage/storeRegistry.ts`** owns the registration table and the subscriber set. It exposes `register(entry)`, `subscribe(handler)`, `teardown(prevBrandId, event?)`, `purge(prevBrandId)`. Both registered entries and ad-hoc subscribers receive the same `BrandSwitchEvent`.
- **`src/lib/brands/brand-switch.ts`** is the public API for consumers — `onBrandChange`, `useBrandChange`, `registerBrandScopedStore`.

`BrandSwitchEvent` is `{ prevBrandId, nextBrandId, reason: "local-switch" | "cross-tab-sync" }`.

## How the switch fires

```
LOCAL SWITCH                                  CROSS-TAB SYNC
useSwitchBrand(brandId)                       ActiveBrandProvider detects metadata change
   │                                              │
   ▼                                              ▼
provider.selectBrand → server action          setSelectedBrandId(metadataId)
   │                                              │
   ▼                                              ▼
storeRegistry.teardown(prev, event)           storeRegistry.teardown(prev, event)
purgeAllForBrand(prev)                        purgeAllForBrand(prev)
storeRegistry.purge(prev)                     storeRegistry.purge(prev)
```

Both paths run the same teardown chain. Subscribers see a `reason` field that tells them which path fired.

## Source of truth (read side)

`user_brand_preferences.active_brand_id` is canonical. The RPC `get_active_brand_id()` reads it with a permission-aware fallback. `user_onboarding_states.is_active` and `auth.users.user_metadata.onboarding.activeBrandId` are projections — the table is for onboarding flows, the metadata is for cross-tab signal only. Do not add new readers of those projections.

## When NOT to use the seam

- **User-level UI preferences** (theme, sidebar collapse, "show me 25 per page") — these should persist across brand switches. Don't register them.
- **Realtime channels that aren't brand-scoped** (account-level notifications, presence) — they survive the switch on purpose. Don't migrate them.

## Migration recipe (for new code)

1. Identify the brand-scoped surface.
2. If it's a Zustand store: add `resetForBrandSwitch` that sets every brand-scoped slice back to its initial value, then `registerBrandScopedStore({ name: "<feature-name>", reset: () => store.getState().resetForBrandSwitch() })` at module bottom.
3. If it's a localStorage key holding brand data: route through `brandScopedStorage` (`:b:<brandId>` suffix) so `purgeAllForBrand` sweeps it. If you can't change the key (e.g. third-party plugin), register a teardown that removes it manually.
4. If it's a React Query hook: put `brandId` in the query key. The provider already clears the cache on switch as a safety net; the key ensures targeted refetch happens during normal usage.
5. If it's a side effect (telemetry, breadcrumb, animation) that needs to know about the switch: `useBrandChange((event) => ...)` inside the consuming component, or `onBrandChange` at module level.

## Reference implementation

`src/lib/organic/store.ts` is the canonical example of a Zustand store that resets on switch. New stores should follow that shape but use `registerBrandScopedStore` from the new module rather than calling `storeRegistry.register` directly.

## Why this exists

Before this seam, every brand-scoped consumer opted in through its own private mechanism — and several didn't opt in at all. Result: switch from brand A to brand B, the studio canvas still showed brand A's nodes, the paid-media performance cache still served brand A's metrics, some realtime channels for brand A stayed open, and a cross-tab switch in another window invalidated nothing locally. See `Roadmap.md` and the plan file at `~/.claude/plans/use-subagents-aggressively-and-shiny-pancake.md` for the full audit that motivated this.
