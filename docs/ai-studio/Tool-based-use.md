Plan: AI Canvas Copilot Implementation
Architecture Overview
The current system has excellent foundations:
- React Flow for canvas rendering (@xyflow/react)
- Zustand store for state management (useStudioStore)
- Existing chat UI (ChatSurface) with streaming capabilities
- Node system with defined types (GeneratorNodeData, LLMNodeData, etc.)
- Edge validation and connection logic
Implementation Strategy
Phase 1: Tool-Calling Infrastructure
1. Create Canvas Tools API (/api/ai-studio/copilot-tools)
   - Define Zod schemas for canvas operations
   - Implement tool functions that map to useStudioStore actions
   - Add LLM endpoint with function calling (OpenAI/Gemini)
2. Core Tool Functions
   - addNode(type, position, data) → setNodes([...nodes, newNode])
   - connectNodes(sourceId, targetId, handleType) → onConnect()
   - updateNode(id, data) → updateNodeData()
   - deleteNode(id) → deleteNode()
   - getCanvasState() → Returns current nodes/edges snapshot
Phase 2: Enhanced Chat Interface
1. Copilot Mode Toggle
   - Extend ChatSurface or create CopilotSurface
   - Switch between "Generation" and "Copilot" modes
   - Expose canvas state to LLM for context
2. Natural Language Processing
   - Send canvas snapshot + user message to LLM
   - LLM returns tool calls to execute
   - Execute tools sequentially via store actions
Phase 3: Canvas Integration
1. Visual Feedback
   - Show AI thinking state during tool execution
   - Highlight nodes/edges being modified
   - Add undo/redo for AI actions
2. Context Awareness
   - LLM understands "the image node" (by type/position)
   - Reference to recently added nodes
   - Spatial relationships ("to the right of", "below")
Technical Implementation Details
Tool Schemas (Zod)
const addNodeSchema = z.object({
  type: z.enum(['generator', 'llm', 'prompt', 'attachment']),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.any())
});
const connectNodesSchema = z.object({
  sourceId: z.string(),
  targetId: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional()
});
LLM System Prompt
You are an AI assistant for a visual workflow editor. You can:
- Add nodes (generator, llm, prompt, attachment)
- Connect nodes with edges
- Update node properties
- Delete nodes
Current canvas: [nodes/edges snapshot]
User command: "Add an image generator and connect it to the text prompt"
Integration Points
- State: Leverage existing useStudioStore actions
- UI: Extend ChatSurface with copilot mode
- API: New /api/ai-studio/copilot endpoint
- Types: Use existing StudioNode and NodeData definitions
Unresolved Questions
1. LLM Provider: Should we use OpenAI, Gemini, or support multiple for the copilot?
2. Node Positioning: How should AI determine where to place new nodes? (smart layout vs. user-specified)
3. Error Handling: What happens when AI tries invalid connections? (auto-correct vs. user feedback)
4. Context Window: How to handle large canvases with many nodes? (summarization vs. selective context)
5. User Permissions: Should users be able to approve/reject AI actions before execution?