# Brand Guidelines Implementation Plan

Based on comprehensive research of the Continuum codebase, here's a detailed implementation plan for creating Brand Guidelines as an AI-enabled artifact.

## Research Summary

### Current State Analysis

**1. Brand Infrastructure Foundation**
- **Multi-tenant architecture**: Established `brand_profiles` schema with proper RLS and UUID-based brand IDs
- **Brand insights pipeline**: Sophisticated backend for generating AI-driven brand voice, audience profiles, and trends using Gemini streaming
- **Document processing**: Complete RAG pipeline via `embed_document` Edge Function using OpenAI embeddings and pgvector for semantic search
- **Storage**: `brand-docs` bucket for document storage with metadata in `brand_documents` table and chunked embeddings in `brand_document_chunks`

**2. AI Generation Patterns**
- **Streaming responses**: SSE (Server-Sent Events) via Edge Functions with Gemini for real-time streaming
- **Tool usage**: Graceful degradation pattern with `url_context_and_search` → `search_only` → `none` fallback
- **System instructions**: Clear separation of system instructions from user input for consistent brand voice generation
- **Timeout handling**: 25-second abort controllers for long-running operations

**3. Existing Component Patterns**
- **Primitives architecture**: Hub-based navigation with `PrimitivesHub` component managing "audience", "guidelines", and "personas" primitives
- **Placeholder in place**: `BrandGuidelinesPrimitive.tsx` currently shows "Coming Soon" via `ComingSoonPrimitive`
- **Schema-driven data**: Strong Zod schema patterns for validation (e.g., `brandInsightsSchema`, `aiStudioArtifactSchema`)

**4. Data Models Available**

```typescript
// Existing brand_documents structure
interface BrandDocument {
  id: UUID
  brand_id: UUID
  name: string
  source: string  // "upload" | "google-drive" | "canva" | "figma" | "sharepoint" | "notion" | "website"
  status: string  // "processing" | "ready" | "error"
  size?: number
  mime_type?: string
  storage_path?: string
  external_url?: string
  error_message?: string
  created_at: timestamptz
  updated_at: timestamptz
}

// Existing brand_document_chunks for RAG
interface BrandDocumentChunk {
  id: bigint
  document_id: UUID
  chunk_index: int
  content: text
  embedding: vector(1536)
  tokens?: int
  created_at: timestamptz
}
```

---

## Comprehensive Implementation Plan: Brand Guidelines Artifact

### **Phase 1: Data Schema & Storage Layer**

**1.1 Create Brand Guidelines Schema**

**Database Migration**: Add `brand_guidelines` table to `brand_profiles` schema

```sql
create table if not exists brand_profiles.brand_guidelines (
  id uuid primary key,
  brand_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  version int not null default 1,
  status text not null default 'draft',  -- 'draft' | 'review' | 'approved' | 'archived'
  
  -- Core sections (JSONB for flexibility)
  voice_and_tone jsonb,        -- { tone: string, keywords: string[], do_list: string[], dont_list: string[] }
  visual_identity jsonb,       -- { colors: string[], typography: string[], logo_usage: string, imagery_style: string }
  messaging_framework jsonb,   -- { value_props: string[], brand_story: string, elevator_pitch: string }
  channel_guidelines jsonb,    -- { [platform]: { tone: string, format: string, restrictions: string[] } }
  dos_and_donts jsonb,         -- { dos: string[], donts: string[], examples: { do: string, dont: string }[] }
  
  -- AI generation metadata
  generation_prompt text,
  source_documents uuid[],     -- Array of brand_document IDs used for grounding
  model_used text,
  
  -- Timestamps
  created_by uuid,             -- User who created
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid
);

create index if not exists idx_brand_guidelines_brand_id on brand_profiles.brand_guidelines (brand_id);
create index if not exists idx_brand_guidelines_status on brand_profiles.brand_guidelines (status);
```

**1.2 Version History Table**

```sql
create table if not exists brand_profiles.brand_guidelines_versions (
  id uuid primary key,
  guidelines_id uuid not null references brand_profiles.brand_guidelines(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,     -- Full frozen copy of guidelines at this version
  change_summary text,         -- Brief description of changes
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_guidelines_versions on brand_profiles.brand_guidelines_versions (guidelines_id, version desc);
```

**1.3 TypeScript Types**

```typescript
// src/lib/schemas/brandGuidelines.ts

export const brandGuidelinesVoiceSchema = z.object({
  tone: z.string(),
  keywords: z.array(z.string()),
  doList: z.array(z.string()),
  dontList: z.array(z.string()),
});

export const brandGuidelinesVisualSchema = z.object({
  colors: z.array(z.string()),
  typography: z.array(z.string()),
  logoUsage: z.string(),
  imageryStyle: z.string(),
});

export const brandGuidelinesMessagingSchema = z.object({
  valueProps: z.array(z.string()),
  brandStory: z.string(),
  elevatorPitch: z.string(),
});

export const brandGuidelinesChannelSchema = z.object({
  tone: z.string(),
  format: z.string(),
  restrictions: z.array(z.string()),
});

export const brandGuidelinesSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(['draft', 'review', 'approved', 'archived']),
  voiceAndTone: brandGuidelinesVoiceSchema,
  visualIdentity: brandGuidelinesVisualSchema.optional(),
  messagingFramework: brandGuidelinesMessagingSchema.optional(),
  channelGuidelines: z.record(z.string(), brandGuidelinesChannelSchema).optional(),
  dosAndDonts: z.object({
    dos: z.array(z.string()),
    donts: z.array(z.string()),
    examples: z.array(z.object({ do: z.string(), dont: z.string() })),
  }).optional(),
  sourceDocuments: z.array(z.string().uuid()).optional(),
  generationPrompt: z.string().optional(),
  modelUsed: z.string().optional(),
  createdBy: z.string().uuid().optional(),
  updatedBy: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  approvedAt: z.string().datetime().optional(),
  approvedBy: z.string().uuid().optional(),
});

export type BrandGuidelines = z.infer<typeof brandGuidelinesSchema>;
export type BrandGuidelinesVoice = z.infer<typeof brandGuidelinesVoiceSchema>;
```

---

### **Phase 2: API Layer & Backend Services**

**2.1 Brand Guidelines Edge Function**

**File**: `supabase/functions/brand-draft-guidelines/index.ts`

```typescript
// Streams brand guidelines generation via SSE using Gemini

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { streamGeminiTextDeltas } from "../brand-draft-voice/geminiClient.ts";

type DraftRequest = {
  brandId: string;
  sourceDocumentIds?: string[];
  locale?: string;
  focusAreas?: string[];  // ['voice', 'visual', 'messaging', 'channels']
};

function sseEncode(event: string, data: string): string {
  return `event: ${event}\n` + data.split("\n").map((line) => `data: ${line}`).join("\n") + "\n\n";
}

function getGeminiConfigFromEnv() {
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3-flash-preview";
  const baseUrl = Deno.env.get("GEMINI_BASE_URL")?.trim() || "https://generativelanguage.googleapis.com";
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  return { apiKey, model, baseUrl };
}

serve(async (req: Request) => {
  // CORS and method validation
  // Parse request payload
  // Fetch source document chunks for grounding
  // Build system instruction with RAG context
  // Stream Gemini response with section-by-section events
});
```

**2.2 System Instruction for Brand Guidelines Generation**

```typescript
const BRAND_GUIDELINES_SYSTEM_INSTRUCTION = `You are an expert brand strategist creating comprehensive brand guidelines.

Your task is to analyze the provided source documents and generate detailed brand guidelines that include:

## Required Sections:

### 1. Voice & Tone
- Primary tone (professional, casual, witty, authoritative, etc.)
- 5-8 characteristic adjectives
- Do's and Don'ts for voice
- Keyword list for consistency

### 2. Visual Identity  
- Primary and secondary color palette
- Typography recommendations
- Logo usage guidelines
- Imagery style and photography direction

### 3. Messaging Framework
- Brand story (2-3 paragraphs)
- Value propositions (3-5 statements)
- Elevator pitch (1 sentence)
- Key messaging pillars

### 4. Channel-Specific Guidelines
- Platform-specific tone adjustments
- Format preferences by channel
- Content restrictions

### 5. Living Examples
- 3 examples of "do this" vs "don't do this"
- Sample social post following guidelines

Output format: JSON object matching the schema provided.
Locale: {LOCALE}
Context from documents: {EMBEDDED_CONTEXT}
`;
```

**2.3 Retrieval Augmented Generation (RAG) Helper**

```typescript
// supabase/functions/brand-draft-guidelines/retrieveContext.ts

async function retrieveRelevantContext(supabase: SupabaseClient, brandId: string, query: string) {
  // 1. Generate query embedding using OpenAI
  const queryEmbedding = await createEmbedding(query);
  
  // 2. Search brand_document_chunks for relevant content
  const { data: chunks } = await supabase
    .schema("brand_profiles")
    .from("brand_document_chunks")
    .select(`
      content,
      document:brand_documents(name, source)
    `)
    .eq("document.brand_id", brandId)
    .eq("document.status", "ready")
    .limit(10);
  
  // 3. Filter by similarity score (if available) or return top chunks
  return chunks?.map(c => c.content).join("\n\n---\n\n") || "";
}
```

**2.4 Next.js API Routes**

**File**: `src/app/api/brand-guidelines/route.ts`

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const createGuidelineSchema = z.object({
  brandId: z.string().uuid(),
  sourceDocumentIds: z.array(z.string().uuid()).optional(),
  focusAreas: z.array(z.enum(['voice', 'visual', 'messaging', 'channels'])).optional(),
  locale: z.string().optional(),
});

export async function POST(request: Request) {
  // Validate input
  // Proxy to Edge Function with streaming response
  return streamResponse();
}

export async function GET(request: Request) {
  // Fetch guidelines with proper RLS
  const url = new URL(request.url);
  const brandId = url.searchParams.get("brandId");
  const guidelineId = url.searchParams.get("id");
  const status = url.searchParams.get("status");
  
  // Return appropriate data
}
```

---

### **Phase 3: Frontend Implementation**

**3.1 Update BrandGuidelinesPrimitive Component**

**File**: `src/components/paid-media/primitives/BrandGuidelinesPrimitive.tsx`

```typescript
"use client";

import { useState, useCallback } from "react";
import { Box, Button, Card, Flex, Heading, Text, Tabs, Callout } from "@radix-ui/themes";
import { PlusIcon, RefreshIcon, CheckIcon, EditIcon } from "@radix-ui/react-icons";

import { useBrandGuidelines } from "@/hooks/useBrandGuidelines";
import { BrandGuidelinesEditor } from "./BrandGuidelinesEditor";
import { BrandGuidelinesViewer } from "./BrandGuidelinesViewer";
import { BrandGuidelinesGenerator } from "./BrandGuidelinesGenerator";
import type { BrandGuidelines } from "@/lib/schemas/brandGuidelines";

export function BrandGuidelinesPrimitive() {
  const { 
    guidelines, 
    isLoading, 
    isGenerating,
    generateGuidelines,
    updateGuideline,
    approveGuideline 
  } = useBrandGuidelines();
  
  const [viewMode, setViewMode] = useState<"view" | "edit" | "generate">("view");
  const [editSection, setEditSection] = useState<string | null>(null);

  if (!guidelines) {
    return (
      <BrandGuidelinesGenerator 
        onGenerate={generateGuidelines}
        isGenerating={isGenerating}
      />
    );
  }

  return (
    <Card className="glass-panel">
      <Flex direction="column" gap="4">
        <Flex align="center" justify="between">
          <Heading size="4">Brand Guidelines</Heading>
          <Flex gap="2">
            <Button 
              variant={viewMode === "view" ? "solid" : "ghost"}
              onClick={() => setViewMode("view")}
            >
              View
            </Button>
            <Button 
              variant={viewMode === "edit" ? "solid" : "ghost"}
              onClick={() => setViewMode("edit")}
            >
              Edit
            </Button>
            <Button 
              variant="ghost"
              onClick={() => setViewMode("generate")}
              disabled={isGenerating}
            >
              <RefreshIcon /> Regenerate
            </Button>
          </Flex>
        </Flex>

        {viewMode === "generate" ? (
          <BrandGuidelinesGenerator 
            onGenerate={generateGuidelines}
            isGenerating={isGenerating}
            sourceDocumentIds={guidelines.sourceDocuments}
          />
        ) : viewMode === "edit" ? (
          <BrandGuidelinesEditor
            guidelines={guidelines}
            onUpdate={updateGuideline}
            onApprove={approveGuideline}
          />
        ) : (
          <BrandGuidelinesViewer guidelines={guidelines} />
        )}
      </Flex>
    </Card>
  );
}
```

**3.2 Brand Guidelines Generator Component**

**File**: `src/components/paid-media/primitives/BrandGuidelinesGenerator.tsx`

```typescript
"use client";

import { useState } from "react";
import { Box, Button, Card, Flex, Progress, Text } from "@radix-ui/themes";
import { RocketIcon, DocumentIcon } from "@radix-ui/react-icons";

interface BrandGuidelinesGeneratorProps {
  onGenerate: (options: { sourceDocumentIds?: string[]; focusAreas?: string[] }) => void;
  isGenerating: boolean;
  sourceDocumentIds?: string[];
}

export function BrandGuidelinesGenerator({ 
  onGenerate, 
  isGenerating,
  sourceDocumentIds = [] 
}: BrandGuidelinesGeneratorProps) {
  const [selectedDocs, setSelectedDocs] = useState<string[]>(sourceDocumentIds);
  const [generationProgress, setGenerationProgress] = useState(0);

  const handleGenerate = () => {
    setGenerationProgress(0);
    onGenerate({ 
      sourceDocumentIds: selectedDocs,
      focusAreas: ['voice', 'visual', 'messaging', 'channels']
    });
    
    // Simulate progress (real implementation would listen to SSE events)
    const interval = setInterval(() => {
      setGenerationProgress(prev => Math.min(prev + 10, 90));
    }, 1000);
    
    // Clear on completion
    setTimeout(() => clearInterval(interval), 15000);
  };

  return (
    <Card className="glass-panel">
      <Flex direction="column" gap="4">
        <Flex align="center" gap="2">
          <Box className="p-2 rounded-full bg-purple-500/20">
            <RocketIcon className="w-5 h-5 text-purple-400" />
          </Box>
          <Heading size="4">Generate Brand Guidelines</Heading>
        </Flex>

        <Text color="gray">
          Create AI-powered brand guidelines based on your existing documents, 
          website, and brand insights. The guidelines will serve as a foundation 
          for all creative content across the platform.
        </Text>

        {selectedDocs.length > 0 && (
          <Box className="p-3 rounded-lg bg-white/5">
            <Text size="2" color="gray">
              Using {selectedDocs.length} source document(s) for grounding
            </Text>
          </Box>
        )}

        {isGenerating ? (
          <Flex direction="column" gap="2">
            <Progress value={generationProgress} size="2" />
            <Text size="2" color="gray">
              Analyzing brand context and generating guidelines...
            </Text>
          </Flex>
        ) : (
          <Button size="2" onClick={handleGenerate}>
            <RocketIcon /> Generate Guidelines
          </Button>
        )}
      </Flex>
    </Card>
  );
}
```

**3.3 Brand Guidelines Editor (Editable)**

**File**: `src/components/paid-media/primitives/BrandGuidelinesEditor.tsx`

```typescript
"use client";

import { useState } from "react";
import { Box, Button, Card, Flex, Heading, Text, TextField, Separator } from "@radix-ui/themes";
import { CheckIcon, EditIcon } from "@radix-ui/react-icons";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";

interface BrandGuidelinesEditorProps {
  guidelines: BrandGuidelines;
  onUpdate: (updates: Partial<BrandGuidelines>) => void;
  onApprove: () => void;
}

function EditableSection({ 
  title, 
  value, 
  onChange, 
  multiline = false 
}: { 
  title: string; 
  value: string; 
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <Box>
        <Flex align="center" justify="between" mb="2">
          <Text weight="bold" size="2">{title}</Text>
          <Button size="1" variant="ghost" onClick={() => setIsEditing(false)}>
            <CheckIcon /> Done
          </Button>
        </Flex>
        {multiline ? (
          <TextField.Root 
            value={value} 
            onChange={(e) => onChange(e.target.value)}
            multiline
            rows={4}
            className="w-full"
          />
        ) : (
          <TextField.Root 
            value={value} 
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Flex align="center" justify="between" mb="2">
        <Text weight="bold" size="2">{title}</Text>
        <Button size="1" variant="ghost" onClick={() => setIsEditing(true)}>
          <EditIcon /> Edit
        </Button>
      </Flex>
      <Text>{value}</Text>
    </Box>
  );
}

export function BrandGuidelinesEditor({ 
  guidelines, 
  onUpdate,
  onApprove 
}: BrandGuidelinesEditorProps) {
  return (
    <Flex direction="column" gap="4">
      {/* Voice & Tone Section */}
      <Card className="p-4">
        <Heading size="3" mb="3">Voice & Tone</Heading>
        <EditableSection 
          title="Primary Tone"
          value={guidelines.voiceAndTone.tone}
          onChange={(tone) => onUpdate({
            voiceAndTone: { ...guidelines.voiceAndTone, tone }
          })}
        />
        <Separator size="4" my="3" />
        <Box>
          <Text weight="bold" size="2" mb="2">Characteristic Keywords</Text>
          <Flex gap="2" wrap="wrap">
            {guidelines.voiceAndTone.keywords.map((keyword, i) => (
              <Box key={i} className="px-2 py-1 rounded bg-white/10">
                <Text size="2">{keyword}</Text>
              </Box>
            ))}
          </Flex>
        </Box>
      </Card>

      {/* Visual Identity Section */}
      {guidelines.visualIdentity && (
        <Card className="p-4">
          <Heading size="3" mb="3">Visual Identity</Heading>
          <EditableSection 
            title="Color Palette"
            value={guidelines.visualIdentity.colors.join(", ")}
            onChange={(colors) => onUpdate({
              visualIdentity: { ...guidelines.visualIdentity, colors: colors.split(",") }
            })}
          />
        </Card>
      )}

      {/* Approval Action */}
      <Flex justify="end">
        <Button onClick={onApprove} color="green">
          <CheckIcon /> Approve Guidelines
        </Button>
      </Flex>
    </Flex>
  );
}
```

**3.4 Custom Hook for Brand Guidelines**

**File**: `src/hooks/useBrandGuidelines.ts`

```typescript
import { useState, useCallback } from "react";
import { useActionState } from "react"; // or useActionState from react

interface UseBrandGuidelinesReturn {
  guidelines: BrandGuidelines | null;
  isLoading: boolean;
  isGenerating: boolean;
  generateGuidelines: (options: GenerateOptions) => Promise<void>;
  updateGuideline: (updates: Partial<BrandGuidelines>) => Promise<void>;
  approveGuideline: () => Promise<void>;
  error: string | null;
}

export function useBrandGuidelines(brandId: string): UseBrandGuidelinesReturn {
  const [guidelines, setGuidelines] = useState<BrandGuidelines | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateGuidelines = useCallback(async (options: GenerateOptions) => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const response = await fetch("/api/brand-guidelines/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, ...options }),
      });

      if (!response.ok) throw new Error("Generation failed");

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const event = parseSSEEvent(chunk);
        
        if (event.type === "guidelines") {
          setGuidelines(event.data);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsGenerating(false);
    }
  }, [brandId]);

  const updateGuideline = useCallback(async (updates: Partial<BrandGuidelines>) => {
    if (!guidelines) return;
    
    try {
      const response = await fetch(`/api/brand-guidelines/${guidelines.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error("Update failed");

      const updated = await response.json();
      setGuidelines(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [guidelines]);

  const approveGuideline = useCallback(async () => {
    if (!guidelines) return;
    
    try {
      const response = await fetch(`/api/brand-guidelines/${guidelines.id}/approve`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Approval failed");

      const updated = await response.json();
      setGuidelines({ ...updated, status: "approved" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [guidelines]);

  return {
    guidelines,
    isLoading,
    isGenerating,
    generateGuidelines,
    updateGuideline,
    approveGuideline,
    error,
  };
}
```

---

### **Phase 4: Grounding & Usage in Other Features**

**4.1 Context Retrieval API**

**File**: `src/lib/api/brandGuidelines.server.ts`

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OpenAI } from "openai";
import { cosineDistance, asc, eq, and, desc } from "drizzle-orm"; // or equivalent

async function retrieveBrandContext(
  brandId: string,
  query: string,
  options?: { sections?: string[]; limit?: number }
) {
  const supabase = await createSupabaseServerClient();
  
  // 1. Generate embedding for query
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  // 2. Search brand_guidelines for relevant content
  const { data: guidelines } = await supabase
    .schema("brand_profiles")
    .from("brand_guidelines")
    .select("voice_and_tone, visual_identity, messaging_framework, channel_guidelines")
    .eq("brand_id", brandId)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .single();

  // 3. Also search document chunks for additional context
  const { data: chunks } = await supabase
    .schema("brand_profiles")
    .from("brand_document_chunks")
    .select("content, embedding")
    .eq("document.brand_id", brandId)
    .eq("document.status", "ready")
    .limit(5);

  return {
    guidelines: guidelines || null,
    documents: chunks?.map(c => c.content) || [],
  };
}

export async function getBrandGuidelinesForFeature(
  brandId: string,
  feature: "content-generation" | "creative-review" | "audience-targeting",
  context: string
) {
  const contextData = await retrieveBrandContext(brandId, context);
  
  // Format for specific feature consumption
  if (feature === "content-generation") {
    return {
      tone: contextData.guidelines?.voice_and_tone?.tone,
      keywords: contextData.guidelines?.voice_and_tone?.keywords,
      examples: contextData.documents.slice(0, 3),
    };
  }
  
  return contextData;
}
```

**4.2 Integration Points**

**In AI Studio Content Generation**:

```typescript
// When generating content, retrieve brand guidelines as context
const brandContext = await getBrandGuidelinesForFeature(
  brandId,
  "content-generation", 
  `Generate a ${platform} post about ${topic}`
);

// Pass to Gemini system instruction
const systemInstruction = `You are writing as ${brandContext.tone} brand. 
Use these keywords: ${brandContext.keywords.join(", ")}.
Example style: ${brandContext.examples[0]}`;
```

**In Creative Review**:

```typescript
// Check generated content against brand guidelines
const violations = await checkAgainstGuidelines(
  generatedContent,
  brandGuidelines
);
```

---

### **Phase 5: UI/UX Refinements**

**5.1 Rich Text Editor Integration**

Consider using **Tiptap** or **Milkdown** for inline editing of longer sections like brand story and value propositions.

**5.2 Preview Mode**

```typescript
// BrandGuidelinesPreview.tsx
export function BrandGuidelinesPreview({ guidelines }: { guidelines: BrandGuidelines }) {
  return (
    <div className="brand-guidelines-preview prose prose-invert max-w-none">
      <section>
        <h2>Voice & Tone</h2>
        <p className="lead">{guidelines.voiceAndTone.tone}</p>
        <div className="keywords">
          {guidelines.voiceAndTone.keywords.map(k => <Badge>{k}</Badge>)}
        </div>
      </section>
      
      <section>
        <h2>Visual Identity</h2>
        <div className="color-palette">
          {guidelines.visualIdentity?.colors.map(c => (
            <div className="color-swatch" style={{ background: c }} />
          ))}
        </div>
      </section>
    </div>
  );
}
```

**5.3 Export Functionality**

```typescript
// Export guidelines as PDF, Markdown, or JSON
async function exportGuidelines(guidelines: BrandGuidelines, format: "pdf" | "md" | "json") {
  // PDF: Use @react-pdf/renderer
  // MD: Convert JSON to Markdown format
  // JSON: Direct download
}
```

---

### **Phase 6: Testing Strategy**

**6.1 Unit Tests**

```typescript
// tests/brand-guidelines/schema.test.ts
describe("Brand Guidelines Schema", () => {
  it("validates complete guidelines object", () => {
    const guidelines = validGuidelinesObject();
    const result = brandGuidelinesSchema.safeParse(guidelines);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { voiceAndTone, ...incomplete } = validGuidelinesObject();
    const result = brandGuidelinesSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});
```

**6.2 Integration Tests**

```typescript
// tests/brand-guidelines/generation.test.ts
describe("Brand Guidelines Generation", () => {
  it("streams complete guidelines via SSE", async () => {
    const response = await generateGuidelines({
      brandId: "test-brand-id",
      sourceDocumentIds: ["doc-1", "doc-2"],
    });
    
    const events = parseSSEStream(response.body);
    expect(events.some(e => e.type === "guidelines")).toBe(true);
    expect(events.some(e => e.type === "guidelinesDone")).toBe(true);
  });
});
```

**6.3 E2E Tests**

```typescript
// tests/e2e/brand-guidelines.spec.ts
import { test, expect } from "@playwright/test";

test("complete brand guidelines workflow", async ({ page }) => {
  // Navigate to primitives page
  // Click on Brand Guidelines card
  // Generate guidelines with documents
  // Wait for generation to complete
  // Edit a section
  // Approve guidelines
  // Verify in organic planner that guidelines are used
});
```

---

### **Implementation Roadmap**

| Phase               | Tasks                                                      | Effort | Priority |
| ------------------- | ---------------------------------------------------------- | ------ | -------- |
| **1. Data Layer**       | Database migration, TypeScript types, API schemas          | 2 days | Critical |
| **2. Backend Services** | Edge Function, RAG retrieval, streaming SSE                | 4 days | Critical |
| **3. API Routes**       | REST endpoints for CRUD operations                         | 2 days | High     |
| **4. Generator UI**     | BrandGuidelinesGenerator component with streaming feedback | 2 days | High     |
| **5. Editor UI**        | Editable sections with inline editing                      | 3 days | High     |
| **6. Viewer UI**        | Read-only view with export functionality                   | 1 day  | Medium   |
| **7. Grounding API**    | Context retrieval for other features                       | 2 days | High     |
| **8. Testing**          | Unit, integration, and E2E tests                           | 2 days | High     |
| **9. Documentation**    | API docs, usage guide                                      | 1 day  | Medium   |

---

### **Key Architectural Decisions**

1. **JSONB Storage**: Using PostgreSQL JSONB for flexible section storage allows easy schema evolution without migrations
2. **Streaming SSE**: Continue existing Gemini streaming pattern for real-time generation feedback
3. **Versioning**: Automatic version history enables rollback and audit trail
4. **Approval Workflow**: Draft → Review → Approved → Archived states prevent accidental usage
5. **Document Grounding**: Reuse existing `brand_document_chunks` for RAG without duplication
6. **Section Isolation**: Each guideline section is independently editable for granular control

---

This plan provides a complete roadmap for implementing Brand Guidelines as a first-class AI-enabled artifact that can be created, edited, approved, and used to ground other features throughout the application. The implementation follows existing patterns in the codebase and leverages the established infrastructure for brand insights, document processing, and AI generation.
