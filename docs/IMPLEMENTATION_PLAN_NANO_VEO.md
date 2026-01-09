# Generative Studio (Nano + Veo) Implementation Plan

## 1. Project Setup & Architecture
- [ ] **Directory Structure**: Create `src/features/studio` with `components`, `hooks`, `stores`, `types`, `utils`.
- [ ] **Dependencies**: Ensure `@xyflow/react`, `zustand`, `lucide-react` are installed.
- [ ] **State Management**: Create `useStudioStore` in `src/features/studio/stores/useStudioStore.ts`.
    -   State: `nodes`, `edges`, `executionState` (map of nodeId -> status), `nodeData` (map of nodeId -> blobs/results).
    -   Actions: `updateNodeStatus`, `setNodeResult`, `runFlow`.

## 2. Core Primitives (The "Engine")
- [ ] **Node Types**: Define strict TypeScript interfaces for `NanoGenNode`, `VeoDirectorNode`, `StringNode`.
- [ ] **Edge Types**: Define custom edges for "Text Flow", "Asset Flow", "Signal Flow".
- [ ] **Validation**: Implement `onConnect` validation to ensure strict type matching (Image -> Image, Text -> Text).

## 3. UI Components (The "Body")
- [ ] **NanoGenNode**:
    -   Wraps `@xyflow/react` Node.
    -   Uses Shadcn `Card`, `Select`, `Textarea`, `Slider`.
    -   Handles: Left (Trigger, Prompt), Right (Image).
- [ ] **VeoDirectorNode**:
    -   Wraps `@xyflow/react` Node.
    -   Uses Shadcn `Card`, `Select`, `Switch`.
    -   Handles: Left (Prompt, First Frame, Last Frame, Ref), Right (Video).
- [ ] **StringNode**:
    -   Simple text input source.
    -   Handle: Right (String).

## 4. Execution Logic
- [ ] **Traversal**: Implement topological sort or recursive traversal to determine execution order.
- [ ] **Mock API**: Create `services/mockAi.ts` to simulate Nano Banana and Veo 3.1 latency and responses.
- [ ] **Execution Loop**:
    1.  User clicks "Run".
    2.  Store calculates dependencies.
    3.  Nodes set to "Waiting".
    4.  Root nodes (String, independent Nano) start "Running".
    5.  On completion, update store with result and trigger dependent nodes.

## 5. Integration
- [ ] **Page**: Create `src/app/studio/page.tsx` to render the `StudioCanvas`.
- [ ] **Layout**: standard layout with a sidebar for dragging nodes (optional) or context menu.
