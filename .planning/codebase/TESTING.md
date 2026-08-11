# Testing Patterns

**Analysis Date:** 2026-03-25

## Summary

The codebase has 93 test files co-located with their source. Three test runners are in active use: `bun:test` (14 files), `vitest` (32 files), and `node:test` (6 files). All are executed by the Bun runner via `bun test`. The happy-dom environment provides DOM APIs. Coverage tooling is not configured.

---

## Test Framework

**Runner:** Bun test runner (`bun test`)
- Config: `bunfig.toml` at project root
- Preload: `bun-test-setup.ts` — sets up happy-dom globals and module mocks

**Multiple assertion styles in use:**

| Importer | Files | Typical use |
|---|---|---|
| `from 'bun:test'` | ~14 | Unit tests, store tests, node component tests |
| `from "vitest"` | ~32 | Hook tests, API route tests, merge strategy tests |
| `from 'node:test'` + `node:assert/strict` | ~6 | Schema validation tests in `src/lib/` |

**Run commands:**
```bash
bun test                  # Run all tests
bun test path/to/file     # Run a single test file
```

Coverage reporting is not configured.

---

## Test Environment Setup

File: `bun-test-setup.ts` (project root)

**What it provides:**
- `happy-dom` Window instance at `http://localhost:3000` (1024×768)
- Globals: `window`, `document`, `navigator`, `HTMLElement`, `HTMLInputElement`, `HTMLTextAreaElement`, `DocumentFragment`, `Node`, `Event`, `CustomEvent`, `MouseEvent`, `KeyboardEvent`, `FocusEvent`, `DOMRect`, `sessionStorage`, `localStorage`
- Module mock for `server-only` — returns empty object so server-only imports don't throw in tests
- Module mock for `next/navigation` — stubs `useRouter`, `useSearchParams`, `usePathname`, `useSelectedLayoutSegment`, `redirect`, `notFound`
- Module mock for `@/components/theme-provider` — stubs `useTheme` and `ThemeProvider`

```typescript
mock.module("server-only", () => {});
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, ... }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "",
}));
```

**Per-test overrides:** Tests override `next/navigation` locally at file scope when they need stateful behavior:
```typescript
// OrganicWorkspaceTabs.test.tsx
let searchParamState = "tab=metrics";
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(searchParamState),
}));
```

---

## Test File Organization

**Co-location:** All test files live next to their source file.
```
src/StudioCanvas/utils/buildNodePayload.ts
src/StudioCanvas/utils/buildNodePayload.test.ts

src/StudioCanvas/nodes/ImageNode.tsx
src/StudioCanvas/nodes/ImageNode.test.tsx

src/components/organic/hooks/useDraftGeneration.ts
src/components/organic/hooks/useDraftGeneration.test.ts
```

**Exception — `__tests__` subdirectory:** One case exists:
```
src/components/ai-studio/hooks/__tests__/merge-strategy.test.ts
```

**Naming:** `{source-file-name}.test.{ts,tsx}`. Mirror the source file name exactly.

**Integration tests:** Placed at module root with explicit naming:
```
src/StudioCanvas/integration.test.ts
```

---

## Test Structure

**Standard pattern (bun:test):**
```typescript
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

describe('ComponentOrUtil', () => {
  beforeEach(() => { /* setup */ });
  afterEach(() => { cleanup(); });

  it('should describe the expected behavior', () => {
    expect(result).toBe(expected);
  });
});
```

**Standard pattern (vitest):**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ComponentOrUtil", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("describes the expected behavior", async () => {
    expect(result).toMatchObject({ ... });
  });
});
```

**Node test pattern (schema tests):**
```typescript
import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("schemaName", () => {
  test("accepts a valid payload", () => {
    const parsed = schema.safeParse(buildPayload());
    assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message);
  });
});
```

---

## What Is Tested

**Utility functions (pure logic):** Heavily tested. Covers all input/output permutations, edge cases, and boundary conditions.
- `src/StudioCanvas/utils/buildNodePayload.test.ts` — payload construction for each node type, edge input prioritization, null/missing inputs
- `src/StudioCanvas/utils/isValidConnection.test.ts` — connection rules, type enforcement, per-handle limits
- `src/StudioCanvas/utils/resolveCreativeAssetDrop.test.ts` — data URL parsing, remote asset resolution

**Zod schemas:** Validated against known-valid and known-invalid inputs.
- `src/lib/organic/calendar-generation.test.ts` — `safeParse` with valid payloads, rejects mismatched dates, rejects trend seeds without `trendId`
- `src/lib/schemas/brandGuidelines.test.ts`, `organicMetrics.test.ts`, `paidMetrics.test.ts`

**React hooks:** Tested with `renderHook` from `@testing-library/react` + `act`.
- `src/components/organic/hooks/useDraftGeneration.test.ts` — success flow, error flow, failed placements, payload construction, missing brand profile validation
- Mock: stream functions stubbed with `vi.fn()` returning async generators

**React components:** Tested with `render` + `fireEvent` + `waitFor` from `@testing-library/react`.
- `src/StudioCanvas/nodes/ImageNode.test.tsx` — renders empty state, renders with image data, handles drag-and-drop, clear button interaction
- `src/components/organic/OrganicWorkspaceTabs.test.tsx` — URL param driven tab state, router push on tab change

**Zustand stores:** Mutated via `setState`, assertions on resulting state.
- `src/StudioCanvas/stores/useStudioStore.test.ts` — node mutations, undo/redo
- `src/CampaignCanvas/stores/useCampaignStore.test.ts` — `addConnectedNode` positioning logic

**API route handlers:** Called directly as `POST(new Request(...))` with mocked Supabase client.
- `src/app/api/paid-media/timeline/route.test.ts`
- `src/app/api/organic/generate-calendar/route.test.ts`
- `src/app/api/organic/ai-studio/apply/route.test.ts`

**Integration tests:**
- `src/StudioCanvas/integration.test.ts` — multi-step workflow execution without UI: node setup, edge wiring, mock API responses, assert store updates

---

## Mocking Patterns

### bun:test mocking

**Module mocking:**
```typescript
import { mock } from "bun:test";
mock.module("next/navigation", () => ({ ... }));
mock.module("@/components/theme-provider", () => ({ ... }));
```

**Function mocking:**
```typescript
const updateNodeData = mock();
useStudioStore.setState({ updateNodeData });
updateNodeData.mockClear();
```

**Zustand store injection:** Replace specific store methods by merging into state:
```typescript
useStudioStore.setState({
  nodes: [],
  edges: [],
  updateNodeData: mockFn,
});
```

### vitest mocking

**Module mocking:**
```typescript
vi.mock("@/lib/organic/store", () => ({
  useCalendarStore: vi.fn(),
}));
vi.mock("../primitives/organic-calendar-api", () => ({
  streamCalendarGeneration: vi.fn(),
}));
```

**Configuring return values:**
```typescript
(useCalendarStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockStore);
(streamCalendarGeneration as unknown as ReturnType<typeof vi.fn>).mockImplementation(
  async (_payload, onEvent) => {
    onEvent({ type: "progress", ... });
    onEvent({ type: "complete", ... });
  }
);
```

**Supabase server client pattern:** Injected via `globalThis.__testCreateSupabaseServerClient` to avoid mocking at the module level when the import happens before `vi.mock` runs:
```typescript
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: (...args) =>
    (globalThis as { __testCreateSupabaseServerClient?: ... }).__testCreateSupabaseServerClient?.(...args),
}));
// In beforeEach:
(globalThis as any).__testCreateSupabaseServerClient = vi.fn().mockResolvedValue({ auth: { getUser: ... } });
```

**Base UI component mocking:** Prefer asserting on rendered output (roles, `aria-selected`, visible text) over mocking the primitive — a spy on a primitive's internals only proves which library is installed, and dies at the next swap. Mock only where a primitive genuinely cannot run under happy-dom: `@floating-ui`'s `autoUpdate` hangs `bun test` with no output, so `DocumentPreviewCard.test` mocks popover/hover-card for that reason.

When you must mock, **wrap** the real module rather than replacing it — `mock.module` is process-wide in bun, so replacing a widely-imported module (`lucide-react` has ~400 importers) silently breaks unrelated specs:
```typescript
mock.module("@base-ui/react/popover", () => ({
  ...require("@base-ui/react/popover"),
  Popover: { ...require("@base-ui/react/popover").Popover, Positioner: PassThrough },
}));
```

### What is NOT mocked

- Utility functions — tested as pure functions with no mocking
- Zod schemas — tested directly with `safeParse`
- Zustand stores — tested with real store implementations, only specific methods are replaced when spying is needed

---

## Fixtures and Factories

**Inline builder functions:** Tests define factory functions at the top of each `describe` block or file:
```typescript
function createAdSetNode(id: string, position: Position): CampaignCanvasNode {
  return { id, type: "ad-set", position, data: { ... } };
}

function buildRequestPayload() {
  return { brandProfileId: "brand-123", weekStart: "2026-02-23", ... };
}
```

**`defaultProps` objects:** Component tests define a `defaultProps` const and spread-override for variant tests:
```typescript
const defaultProps = { id: '1', data: { image: undefined }, ... };
const propsWithImage = { ...defaultProps, data: { image: 'base64img', fileName: 'test.png' } };
```

**Typed fixtures:** Fixtures are typed against the actual domain types, not `object` or `any`:
```typescript
const node: StudioNode = { id: 'nano', type: 'nanoGen', position: { x: 0, y: 0 }, data: { ... } };
const resolvedData = new Map<string, NodeOutput>();
```

---

## Test Coverage Areas and Gaps

**Well-covered:**
- StudioCanvas utility functions (`buildNodePayload`, `isValidConnection`, `resolveCreativeAssetDrop`, `workflowSerialization`, `aspectRatioSizing`, `buildDependencyGraph`)
- Organic hook logic (`useDraftGeneration`, `mapWeeklyGridToCalendarPlacements`)
- Zod schema validation (`calendar-generation`, `brandGuidelines`, `paidMetrics`, `organicMetrics`, `productCatalogs`)
- API route handlers for organic and paid-media
- Canvas store mutations (`useStudioStore`, `useCampaignStore`)
- AI Studio canvas merge strategy (`merge-strategy.ts`)

**Coverage gaps:**
- RSC page components — not testable without a server environment; none are tested
- `src/middleware.ts` — route protection logic is untested
- Most `src/components/paid-media/` UI components (some exist but coverage is sparse)
- `src/lib/api/http.ts` — the core fetch wrapper has no test file
- Server actions in `src/app/(post-auth)/*/actions.ts` — not tested
- `src/hooks/` — most custom hooks lack tests (`useJainaSocket`, `useTimelineBlocks`, etc.)

---

## Common Patterns

**Async component interaction:**
```typescript
fireEvent.click(screen.getByLabelText('Clear image'));
await waitFor(() => {
  expect(updateNodeData).toHaveBeenCalledWith('1', { image: undefined, ... });
});
```

**Testing streaming event handling:**
```typescript
(streamCalendarGeneration as unknown as ReturnType<typeof vi.fn>).mockImplementation(
  async (_payload, onEvent) => {
    onEvent({ type: "progress", completed: 1, total: 2, message: "Drafting..." });
    onEvent({ type: "complete", summary: { total: 1, succeeded: 1, failed: 0 } });
  }
);
await act(async () => { await result.current.handleGenerateDrafts(); });
expect(mockStore.setGridStatus).toHaveBeenCalledWith("complete");
```

**Asserting partial object shape:**
```typescript
expect(mockStore.addDraft).toHaveBeenCalledWith(
  "2026-01-26",
  expect.objectContaining({ id: "seed-1", title: "Test Title" })
);
```

**Null-return guard tests:**
```typescript
const payload = buildExtendVideoPayload(node, new Map(), [], []);
expect(payload).toBeNull();
```

---

## Notable Observations

- **Three test runners coexist:** `bun:test`, `vitest`, and `node:test` are all active. New tests for hooks and API routes tend to use `vitest`; new tests for pure utilities and stores tend to use `bun:test`. There is no policy document governing which to use.
- **Vitest config is deleted:** `vitest.config.ts` is listed as deleted in git status. Vitest tests may currently be misconfigured — check if `bun test` still picks them up correctly.
- **`as unknown as ReturnType<typeof vi.fn>` is the vitest cast idiom:** Used everywhere to bridge the gap between module mock types and `vi.fn()` type. Verbose but consistent.
- **No coverage thresholds:** Neither `bunfig.toml` nor any config file sets a minimum coverage requirement.
- **`@testing-library/react` version 16** is used — compatible with React 19.
- **No snapshot tests:** No `.snap` files or `toMatchSnapshot()` calls found. All assertions are explicit.
- **Route handler tests call handlers directly:** `POST(new Request(...))` is the pattern, not `supertest` or similar. This is idiomatic for Next.js App Router route testing.
