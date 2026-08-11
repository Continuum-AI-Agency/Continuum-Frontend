# Coding Conventions

**Analysis Date:** 2026-03-25

## Summary

The codebase uses TypeScript 5 with strict conventions enforced by ESLint (Next.js flat config). Components default to RSC unless interactivity is required; `"use client"` is pushed as high as possible in the subtree. Named exports dominate outside of Next.js page/layout files, and Zod is used pervasively at every client/server boundary.

---

## TypeScript Usage

**Strict mode:** TypeScript 5.9 with `@types/react` 19 and `@types/node` 20. No explicit `tsconfig.json` found at root — previously deleted per git status. Inference is relied on heavily.

**No-any policy:** Violated regularly in practice, especially in test fixtures and Zustand store interactions. `as any` and `: any` appear ~107 times in the StudioCanvas module alone. Examples:
- `data: { model: 'kling-omni', prompt: '...' } as any` in `buildNodePayload.test.ts`
- `global.window = window as any` in `bun-test-setup.ts`
- Store spy setups: `let originalUpdateNodeData: any`

`unknown` is used in server/API code when correctness matters (e.g., `body: unknown` in `route.ts` before Zod parsing).

**Type imports:** `import type { ... }` is used consistently to separate value imports from type imports:
```typescript
import type { CalendarGenerationEvent } from "@/lib/organic/calendar-generation";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";
```

**Inferred Zod types:** Schema-first typing is the pattern — define a Zod schema, derive the TypeScript type:
```typescript
const formSchema = z.object({ selected: z.record(z.string(), z.boolean()) });
type FormValues = z.infer<typeof formSchema>;
```

**Discriminated unions:** Used for node data types: `type StudioNodeData = StringNodeData | NanoGenNodeData | VideoGenNodeData | ...`

**`interface` vs `type`:** Both are used. `interface` is preferred for object shapes that can extend (`BaseNodeData`, `StudioState`); `type` is used for union types and simple aliases.

---

## Component Patterns

**RSC-first:** Pages in `src/app/(post-auth)/` are async server components by default. `"use client"` is applied to interactive shells:
- `src/app/(post-auth)/ai-studio/AIStudioClient.tsx` — wraps the full canvas
- `src/app/(post-auth)/paid-media/PaidMediaClient.tsx` — wraps the paid media dashboard
- `src/app/(post-auth)/organic/page.tsx` is an async RSC that passes slots to client children

**Slot pattern for composition:** RSC pages fetch data and pass pre-rendered slot props into client components:
```typescript
// page.tsx (RSC)
export default async function OrganicPage() {
  return <OrganicWorkspaceTabs plannerSlot={<Planner />} metricsSlot={<Metrics />} />;
}
// OrganicWorkspaceTabs.tsx ("use client") receives ReactNode slots
type Props = { plannerSlot: React.ReactNode; metricsSlot: React.ReactNode };
```

**Props typing:** Props typed as inline `type Props = { ... }` blocks directly above the component. Object param for 3+ props. No default exports for non-page components — named exports throughout.

**Prop destructuring:** Destructured directly in function signature: `function ImageNode({ id, data, selected }: NodeProps<...>)`

**Hooks within components:** Multiple Zustand store selectors called individually for granular subscriptions:
```typescript
const updateNodeData = useStudioStore((state) => state.updateNodeData);
const updateNode = useStudioStore((state) => state.updateNode);
```

**`React.useCallback` and `React.useMemo`:** Applied at the module level using the `React.` namespace (not imported destructured):
```typescript
const handleValueChange = React.useCallback((value: string) => { ... }, [router, searchParams]);
```

---

## Naming Conventions

**Files:**
- React components: PascalCase — `ImageNode.tsx`, `OrganicWorkspaceTabs.tsx`, `AIStudioClient.tsx`
- Hooks: camelCase prefixed with `use` — `useDraftGeneration.ts`, `useStudioStore.ts`
- Utility functions: camelCase — `buildNodePayload.ts`, `isValidConnection.ts`, `resolveCreativeAssetDrop.ts`
- Server actions: `actions.ts` in feature route directory; function names suffixed `Action` or prefixed `Server`
- API clients: `*.client.ts` (browser) / `*.server.ts` (RSC) — e.g., `productCatalogs.client.ts`
- Route handlers: `route.ts` per Next.js convention
- Test files: co-located with source, `*.test.ts` / `*.test.tsx`

**Functions:**
- camelCase: `buildNanoGenPayload`, `handleGenerateDrafts`, `mapWeeklyGridToCalendarPlacements`
- Server actions: `broadcastContinuumEvent`, `broadcastAiTaskProgress` (action suffix not applied at the exported function level in `eventBridge.ts`)
- Descriptive: `isValidDayId`, `greatestCommonDivisor`, `simplifyAspectRatio`

**Variables:**
- camelCase: `brandProfileId`, `searchParamState`, `resolvedData`
- Constants: `SCREAMING_SNAKE_CASE` for module-level: `RF_DRAG_MIME`, `TEXT_MIME`, `ORGANIC_PLATFORM_KEYS`
- Boolean state: `is*` prefix: `isExecuting`, `isComplete`, `isSelectedByOther`

**Types and Interfaces:**
- PascalCase: `StudioNode`, `ImageNodeData`, `CalendarGenerationEvent`
- Discriminated union tag fields: `type: 'string' | 'image' | 'video'`

**Exports:**
- Named exports are standard everywhere except Next.js pages/layouts (which use `export default`)
- Actions files use named exports: `export async function broadcastContinuumEvent`
- Component files: `export function ImageNode`, `export function OrganicWorkspaceTabs`
- Utility files: `export function buildNanoGenPayload`, `export function isValidConnection`

---

## Import and Export Patterns

**Path alias:** `@/*` maps to `./src/*`. Used universally for cross-module imports. Relative imports only for same-directory or immediate parent:
```typescript
import { useStudioStore } from '../stores/useStudioStore'; // relative, within StudioCanvas
import { useCalendarStore } from "@/lib/organic/store"; // alias, cross-module
```

**Import grouping (observed, not enforced by tooling):**
1. React / framework imports
2. Third-party libraries (`@xyflow/react`, `@base-ui/react`, `zod`)
3. Internal `@/` alias imports (lib, components, types)
4. Relative imports

**Type-only imports:** `import type { ... }` is used consistently when importing types that carry no runtime value.

**Barrel files:** Sparse. `src/StudioCanvas/utils/` does not have a barrel; utils are imported individually. `src/components/ai-studio/canvas/index.ts` is a barrel for canvas exports.

---

## Error Handling

**API routes:** Consistent pattern — parse with Zod `safeParse`, return 400 on failure; wrap backend call in `try/catch`, return 401/500 on upstream errors:
```typescript
const parsed = requestSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.message }, { status: 400 });
}
try {
  // ... fetch edge function
} catch {
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
```

**Comment on empty catches:** `// Ignore response parse failure and return generic error.` — inline comment explains intent, not mechanics.

**Client-side:** Hooks use `try/catch` around async operations, setting error state on the Zustand store:
```typescript
} catch (err) {
  mockStore.setGridStatus("error");
  mockStore.setGridError(err instanceof Error ? err.message : "Unknown error");
}
```

**`assertOk` helper:** `src/lib/api/errors.ts` — `assertOk(response)` throws on non-2xx; used inside `http.ts`.

---

## Form Patterns

**React Hook Form + Zod:** Always together:
```typescript
const formSchema = z.object({ selected: z.record(z.string(), z.boolean()) });
type FormValues = z.infer<typeof formSchema>;

const form = useForm<FormValues>({
  resolver: zodResolver(formSchema),
  defaultValues: { ... },
});
```

File: `src/app/(post-auth)/brand-profiles/[brandProfileId]/assets/BrandAssetsForm.tsx`

`@hookform/resolvers` package is listed as a dependency (`^5.2.2`). `react-hook-form` is `^7.71.2`.

---

## API Client Patterns

**`http.ts`:** Generic `request<TResponse>` function in `src/lib/api/http.ts`. Accepts a `RequestOptions` object. Handles Bearer token auth, JSON serialization, optional Zod schema validation on response:
```typescript
export async function request<TResponse = unknown>(options: RequestOptions<TResponse>): Promise<TResponse>
```
Token from `getBrowserAccessToken()` in `src/lib/auth/getBrowserAccessToken.ts`.

**Domain clients:** Separate `*.client.ts` files per domain (e.g., `productCatalogs.client.ts`). They wrap `http.request` with domain-specific paths.

**Server-side fetching:** Route handlers call Supabase Edge Functions directly via `fetch()`. Pattern:
1. Parse request body with Zod
2. Get Supabase session token
3. Call edge function with `Authorization: Bearer {token}` and `apikey` headers
4. Parse response with optional Zod schema

**Server actions:** In `src/app/_actions/eventBridge.ts` — `"use server"` directive. Validated with Zod before emitting.

---

## Comment and Documentation Style

**Intent comments only:** Comments explain why, not what. Mechanics should be clear from the code.
```typescript
// Ignore response parse failure and return generic error.
// BDD: Given a string node, when all input handles are empty, then return an empty payload to trigger fast enrichment.
```

**No commented-out code:** Not observed in production files.

**No JSDoc/TSDoc:** Not used in the source files examined. Types and function signatures are self-documenting.

**Section delimiters:** Occasional inline comments as section headers in long utility files:
```typescript
// Resolve Images (Multiple allowed)
// Resolve Audio (Single)
// Resolve Documents (Multiple)
```

**No emojis** in comments (enforced by AGENTS.md).

---

## Notable Observations

- **Mixed test runners:** 32 files use `vitest`, 14 use `bun:test`, and 6 use `node:test`. This is a technical debt item — no single canonical test framework. `bun test` runs all three since Bun supports vitest and Node test runners.
- **`as any` is common in tests:** Tests use `as any` freely in fixture construction; production code is cleaner but not pristine.
- **No `.prettierrc`:** No Prettier config found. Formatting is not enforced by tooling — relies on ESLint and developer discipline.
- **ESLint config is minimal:** `eslint.config.mjs` only extends `next/core-web-vitals` and `next/typescript`. No custom rules for naming, import order, or function length.
- **Default exports only for Next.js pages:** Components and utilities consistently use named exports, making tree-shaking and refactoring easier.
