# Canvas Node & Edge Definitions

## Node Types

### PromptNode
**Purpose**: Provides text prompt input for generation

**Outputs:**
- `output` (type: `text`) - The prompt text

**Data:**
```typescript
type PromptNodeData = {
  prompt: string;
}
```

---

### NegativeNode
**Purpose**: Provides negative prompt text (what to avoid)

**Outputs:**
- `output` (type: `text`) - The negative prompt text

**Data:**
```typescript
type NegativeNodeData = {
  negativePrompt: string;
}
```

---

### ModelNode
**Purpose**: Defines generation model and parameters

**Outputs:**
- `aspect` (type: `aspect`) - Aspect ratio (1:1, 16:9, etc.)
- `provider` (type: `provider`) - AI model (nano-banana, veo-3-1, sora-2)

**Data:**
```typescript
type ModelNodeData = {
  provider: AiStudioProvider;
  medium: AiStudioMedium;
  aspectRatio: string;
  imageSize?: "1k" | "2k" | "4k";
  responseModality?: "image" | "image+text";
}
```

---

### AttachmentNode
**Purpose**: References uploaded or generated assets

**Outputs:**
- `output` (type: `image` or `video`) - Dynamic based on MIME type

**Data:**
```typescript
type AttachmentNodeData = {
  label: string;
  path: string;
  mimeType: string;
  previewUrl: string;
}
```

**MIME Type Handling:**
- `image/*` → Output type: `image`
- `video/*` → Output type: `video`

---

### GeneratorNode
**Purpose**: Executes AI generation using connected inputs

**Inputs:**
- `prompt` (type: `text`) - Required prompt text
- `negative` (type: `text`) - Optional negative prompt
- `ref` (type: `image`) - Optional reference image(s) - multiple allowed
- `firstFrame` (type: `image`) - First frame for video (video only)
- `lastFrame` (type: `image`) - Last frame for video (video only)
- `aspect` (type: `aspect`) - Aspect ratio override
- `provider` (type: `provider`) - Model provider override

**Outputs:**
- `output` (type: `image` or `video`) - Generated artifact for downstream use

**Data:**
```typescript
type GeneratorNodeData = {
  provider: AiStudioProvider;
  medium: AiStudioMedium;
  prompt: string;
  aspectRatio: string;
  negativePrompt?: string;
  guidanceScale?: number;
  seed?: number;
  referenceAssetPath?: string;
  firstFramePath?: string;
  lastFramePath?: string;
  status?: string;
  jobId?: string;
  artifactPreview?: string;
  artifactName?: string;
  
  // Output exposure for downstream nodes
  outputPath?: string;
  outputUrl?: string;
  outputType?: 'image' | 'video';
}
```

**Conditional Handles:**
- `firstFrame` and `lastFrame` handles only visible when `medium === 'video'`

---

### PreviewNode
**Purpose**: Displays generated output

**Inputs:**
- `input` (type: `image`) - Input from generator

**Data:**
```typescript
type PreviewNodeData = {
  artifactPreview?: string;
  artifactName?: string;
  medium?: AiStudioMedium;
}
```

---

## Edge Definitions

### Edge Structure
```typescript
type Edge = {
  id: string;
  source: string;           // Source node ID
  target: string;           // Target node ID
  sourceHandle?: string;     // Source handle ID (usually "output")
  targetHandle: string;     // Target handle ID (input handle)
  type: "default";
}
```

### Valid Target Handles

| Handle ID | Port Type | Description | Source Node Types |
|-----------|------------|-------------|-------------------|
| `prompt` | `text` | Prompt input | PromptNode, NegativeNode, GeneratorNode |
| `negative` | `text` | Negative prompt input | NegativeNode |
| `ref` | `image` | Reference image input | AttachmentNode, GeneratorNode (image output) |
| `firstFrame` | `image` | First frame for video | AttachmentNode, GeneratorNode (image output) |
| `lastFrame` | `image` | Last frame for video | AttachmentNode, GeneratorNode (image output) |
| `aspect` | `aspect` | Aspect ratio | ModelNode, GeneratorNode |
| `provider` | `provider` | AI model provider | ModelNode, GeneratorNode |
| `input` | `image` | Preview input | GeneratorNode (any output), AttachmentNode |

---

## Port Type Compatibility

### Text Port
**Can connect to:** `prompt`, `negative`

**Compatible source nodes:**
- PromptNode
- NegativeNode
- GeneratorNode

---

### Image Port
**Can connect to:** `ref`, `firstFrame`, `lastFrame`, `input`

**Compatible source nodes:**
- AttachmentNode (image/* MIME)
- GeneratorNode (outputType: 'image')

---

### Video Port
**Can connect to:** `referenceVideo` (future)

**Compatible source nodes:**
- AttachmentNode (video/* MIME)

---

### Aspect Port
**Can connect to:** `aspect`

**Compatible source nodes:**
- ModelNode
- GeneratorNode

---

### Provider Port
**Can connect to:** `provider`

**Compatible source nodes:**
- ModelNode
- GeneratorNode

---

## Connection Rules

### Valid Connections
✅ PromptNode.output → GeneratorNode.prompt
✅ NegativeNode.output → GeneratorNode.negative
✅ ModelNode.aspect → GeneratorNode.aspect
✅ ModelNode.provider → GeneratorNode.provider
✅ AttachmentNode.output → GeneratorNode.ref
✅ GeneratorNode.output (image) → GeneratorNode.ref
✅ GeneratorNode.output (image) → GeneratorNode.firstFrame
✅ GeneratorNode.output (image) → GeneratorNode.lastFrame
✅ GeneratorNode.output → PreviewNode.input

### Invalid Connections
❌ PromptNode.output → GeneratorNode.ref (text → image)
❌ AttachmentNode.output → GeneratorNode.prompt (image → text)
❌ ModelNode.aspect → GeneratorNode.prompt (aspect → text)

---

## Input Resolution Flow

When a GeneratorNode is triggered:

1. **Find all incoming edges** to the generator node
2. **For each edge, extract data from source node:**
   - PromptNode/NegativeNode → Extract `prompt` or `negativePrompt`
   - AttachmentNode → Create RefImage with `path`, `mimeType`, `label`
   - GeneratorNode with `outputPath` → Create RefImage from output
   - ModelNode → Extract `aspectRatio` or `provider`
3. **Merge with local data** as fallback:
   - Connected inputs take precedence
   - Local GeneratorNodeData fields used if not connected
4. **Construct payload** for backend API
5. **After generation**, store output in GeneratorNodeData:
   - `outputPath`: Backend artifact path
   - `outputUrl`: Public URL
   - `outputType`: 'image' or 'video'

---

## Example Workflows

### Simple Image Generation
```
[PromptNode] --prompt--> [GeneratorNode] --output--> [PreviewNode]
```

### Multi-Reference Generation
```
[AttachmentNode1] --ref-\
[AttachmentNode2] --ref--> [GeneratorNode] --output--> [PreviewNode]
[AttachmentNode3] --ref-/
```

### Image to Video Pipeline
```
[PromptNode] --prompt--> [Generator: Nano Banana] --output--> [Attachment: Generated Image]
                                                                           |
                                                                           --firstFrame--> [Generator: Veo 3.1] --output--> [PreviewNode]
```

### Full Pipeline with Model Control
```
            --prompt--> 
[PromptNode]            [PromptNode2] --negative--> 
                        \                         /
[ModelNode] --aspect, provider--> [GeneratorNode] --output--> [PreviewNode]
```

---

## Handle Positioning

### Left (Input Handles - GeneratorNode)
- `prompt`: top 30%
- `negative`: top 45%
- `ref`: top 60%
- `firstFrame`: top 72% (video only)
- `lastFrame`: top 82% (video only)

### Right (Output Handles - Most Nodes)
- `output`: top 50%

### Left (Input Handles - PreviewNode)
- `input`: top 50%

### Right (Output Handles - ModelNode)
- `aspect`: top 70%
- `provider`: top 85%
