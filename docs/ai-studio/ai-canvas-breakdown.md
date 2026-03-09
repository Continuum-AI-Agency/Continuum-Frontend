# AI Studio Canvas: Product & User Documentation Breakdown

The **AI Canvas** (`@src/components/ai-studio/canvas/`) is a visual orchestration engine for complex AI workflows. It enables a "modular creation" mindset where users chain specialized AI blocks to generate, refine, and iterate on high-fidelity content.

---

## 1. System Architecture: The "Modular Studio"
The canvas is built on a **Modular Primitive Strategy**, moving away from static sidebars to a **Canvas-First** interaction model.
*   **Engine**: Powered by `@xyflow/react` (React Flow).
*   **Interaction**: Right-click context menus drive creation; drag-and-drop ingestion handles assets from the creative library.
*   **Rendering**: Uses `ai-elements` primitives for a clean, media-centric visual language (no heavy chrome; aspect-ratio preservation).

---

## 2. Node Breakdown (The Building Blocks)

Nodes are the specialized "machines" in the workflow. Each node has specific **Target Handles** (Inputs) and **Source Handles** (Outputs).

### Input & Reference Nodes
| Node | Purpose | Inputs | Outputs |
| :--- | :--- | :--- | :--- |
| **Prompt** | Primary creative direction. | Manual Text | `text` (Port family) |
| **Negative** | Specific exclusion rules (e.g., "extra limbs"). | Manual Text | `text` |
| **Attachment** | Ingests existing media for reference. | File Drop | `image`, `video`, `audio`, `doc` |
| **Model** | Engine config (Provider + Aspect Ratio). | UI Selection | `provider`, `aspect` |

### Generation & Processing Nodes
| Node | Purpose | Unique Behavior |
| :--- | :--- | :--- |
| **Generator** | Core image/video creation engine. | Supports **First/Last Frame** video constraints. |
| **LLM Generator** | Text-to-text instructions & orchestration. | Controls for **Temperature** and **Max Tokens**. |
| **Image Processor**| Targeted media manipulation. | Modes: **Inpainting**, **Outpainting**, **Relighting**. |
| **Composite** | Post-generation assembly. | **Text Overlays**, **Image Blending**, **Masking**. |

### Logic & Automation Nodes
| Node | Purpose | Workflow Impact |
| :--- | :--- | :--- |
| **Array** | Defines a list of text/data items. | Enables **Batch Processing** of multiple prompts. |
| **Iterator** | The loop controller. | Iterates through an Array; tracks **% Completion**. |

---

## 3. Behavior & Data Flow: "How it Works"

### Typed Connectivity
Connections (Edges) are **color-coded and type-safe** to prevent illegal flows:
*   **Blue**: Creative Prompts (`text`)
*   **Amber**: Exclusion Rules (`negative`)
*   **Purple**: Reference Data (`image`, `video`, `array`)
*   **Green**: Successful Generation Outputs

### Execution Flow (DAG Logic)
The canvas executes nodes in a **Dependency-Aware Sequence**:
1.  **Input Resolution**: A node waits until all upstream data (prompts, ref images) is ready.
2.  **Payload Assembly**: The system "harvests" data from the incoming edges to build the API payload.
3.  **Concurrent Execution**: Up to **3 nodes** can execute simultaneously to maximize throughput.
4.  **Streaming Updates**: Generations (especially video and LLM text) stream results in real-time to the node's preview.

---

## 4. User Experience Features

*   **Iteration Controls**: The **Iterator Node** allows users to "Play," "Pause," and "Reset" loop-based workflows.
*   **Smart Previews**: Media nodes render with `object-contain` to preserve the source's professional aspect ratio.
*   **Contextual UI**: Advanced controls (Seed, Guidance Scale) are hidden in collapsible "Advanced" menus to reduce visual noise.
*   **Collaborative Sync**: Built-in support for multiple users (presence cursors and sync status) allows for collaborative workflow design.

---

## 5. Summary Matrix for Documentation

| Feature | Specification |
| :--- | :--- |
| **Primary Library** | `@xyflow/react` |
| **Data Sync** | Real-time Postgres + Broadcast (Zustand + Supabase) |
| **Node Style** | Low-chrome, media-first (Tailwind 4 / Radix UI) |
| **Edge Behavior** | Typed validation with visual port coloring |
| **Execution Path** | Concurrent DAG scheduler with SSE streaming |
