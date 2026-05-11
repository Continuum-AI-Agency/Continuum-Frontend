import { computeTextDelta, extractGeminiChunkText } from "./geminiStream.ts";

// --- Tool Execution ---

async function createEmbedding(input: string, geminiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      taskType: "RETRIEVAL_QUERY",
      content: { parts: [{ text: input }] },
      outputDimensionality: 1536,
    }),
  });
  if (!response.ok) throw new Error("Failed to create embedding");
  const data = await response.json();
  return data.embedding.values;
}

export { createEmbedding as createQueryEmbedding };

async function searchBrandDocs(brandId: string, query: string, geminiKey: string, supabase: any) {
  if (!geminiKey) return "No embedding key available.";
  try {
    const embedding = await createEmbedding(query, geminiKey);
    const { data: chunks, error } = await supabase.rpc("match_brand_documents", {
      query_embedding: embedding,
      match_threshold: 0.35,
      match_count: 10,
      filter_brand_id: brandId,
    });
    if (error) throw error;
    if (!chunks || chunks.length === 0) return "No relevant documents found.";
    return chunks.map((c: any) => c.content).join("\n\n");
  } catch (e) {
    console.error("Search error:", e);
    return "Error searching documents.";
  }
}

async function executeTool(functionCall: any, brandId: string, supabase: any, geminiKey: string): Promise<any> {
  if (functionCall.name === "search_brand_documents") {
    const query = functionCall.args.query;
    return await searchBrandDocs(brandId, query, geminiKey, supabase);
  }
  throw new Error(`Unknown tool: ${functionCall.name}`);
}

// --- Pre-fetch ---

export type BrandContextSources = {
  documents: string;
  trends: string;
  events: string;
  questions: string;
  strategicAnalysis: string;
};

export async function prefetchBrandContext(
  brandId: string,
  query: string,
  geminiKey: string,
  supabase: any
): Promise<BrandContextSources> {
  let queryEmbedding: number[];
  try {
    queryEmbedding = await createEmbedding(query, geminiKey);
  } catch {
    return { documents: "", trends: "", events: "", questions: "", strategicAnalysis: "" };
  }

  const [docsResult, trendsResult, eventsResult, questionsResult, stratResult] = await Promise.allSettled([
    supabase.rpc("match_brand_documents", {
      query_embedding: queryEmbedding,
      match_threshold: 0.35,
      match_count: 10,
      filter_brand_id: brandId,
    }),
    supabase.rpc("match_brand_insights_trends", {
      query_embedding: queryEmbedding,
      match_threshold: 0.35,
      match_count: 5,
      filter_brand_id: brandId,
    }),
    supabase.rpc("match_brand_insights_events", {
      query_embedding: queryEmbedding,
      match_threshold: 0.35,
      match_count: 5,
      filter_brand_id: brandId,
    }),
    supabase.rpc("match_brand_insights_questions", {
      query_embedding: queryEmbedding,
      match_threshold: 0.35,
      match_count: 5,
      filter_brand_id: brandId,
    }),
    supabase.rpc("match_strategic_analysis_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: 0.35,
      match_count: 5,
      filter_brand_id: brandId,
    }),
  ]);

  const extractDocs = (r: PromiseSettledResult<any>): string => {
    if (r.status === "rejected" || r.value?.error) return "";
    return (r.value?.data ?? []).map((c: any) => c.content).filter(Boolean).join("\n\n");
  };

  const extractTrends = (r: PromiseSettledResult<any>): string => {
    if (r.status === "rejected" || r.value?.error) return "";
    return (r.value?.data ?? [])
      .map((t: any) => [t.title, t.description, t.relevance_to_brand].filter(Boolean).join(" — "))
      .join("\n");
  };

  const extractEvents = (r: PromiseSettledResult<any>): string => {
    if (r.status === "rejected" || r.value?.error) return "";
    return (r.value?.data ?? [])
      .map((e: any) => [e.title, e.description, e.opportunity].filter(Boolean).join(" — "))
      .join("\n");
  };

  const extractQuestions = (r: PromiseSettledResult<any>): string => {
    if (r.status === "rejected" || r.value?.error) return "";
    return (r.value?.data ?? [])
      .map((q: any) => [q.question_text, q.why_relevant].filter(Boolean).join(" — "))
      .join("\n");
  };

  const extractStrat = (r: PromiseSettledResult<any>): string => {
    if (r.status === "rejected" || r.value?.error) return "";
    return (r.value?.data ?? [])
      .map((s: any) => [s.label, s.embedding_text].filter(Boolean).join(": "))
      .join("\n");
  };

  return {
    documents: extractDocs(docsResult),
    trends: extractTrends(trendsResult),
    events: extractEvents(eventsResult),
    questions: extractQuestions(questionsResult),
    strategicAnalysis: extractStrat(stratResult),
  };
}

// --- Streaming ---

export type GeminiStreamRequest = {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemInstruction: string;
  input: string;
  signal: AbortSignal;
  tools?: unknown[];
  brandId?: string; // for tool execution
  supabase?: any; // for tool execution
  geminiKey?: string; // for tool execution (embeddings)
  groundingModel?: string;
};

export type GeminiRequestToolsMode = "url_context_and_search" | "search_only" | "none";

export async function streamGeminiTextDeltas({
  apiKey,
  baseUrl,
  model,
  systemInstruction,
  input,
  signal,
  tools,
  brandId,
  supabase,
  geminiKey,
  groundingModel,
}: GeminiStreamRequest): Promise<ReadableStream<string>> {
  const groundingModelToUse = groundingModel || model;
  const groundingRequestBody = buildGeminiStreamGenerateContentRequestBody({
    systemInstruction: "You are a research assistant. Extract all relevant information from the website and search results to help a brand strategist.",
    input: `Research context for: ${input}`,
    toolsMode: "url_context_and_search",
  });

  const groundingResponse = await postGenerateContent({
    apiKey,
    baseUrl,
    model: groundingModelToUse,
    requestBody: groundingRequestBody,
    signal,
  });

  const groundingContext = groundingResponse.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text || "")
    .join("\n") || "No research context found.";

  const phase2Input = `Research Context:\n${groundingContext}\n\nUser Request: ${input}`;
  let contents: any[] = [{ role: "user", parts: [{ text: phase2Input }] }];

  const MAX_TOOL_ROUNDS = 5;
  let rounds = 0;

  while (true) {
    if (rounds++ >= MAX_TOOL_ROUNDS) throw new Error("Gemini tool loop exceeded max rounds");
    const requestBody = buildGeminiStreamGenerateContentRequestBody({
      systemInstruction,
      input: "",
      tools,
    });
    (requestBody as any).contents = contents;

    const response = await postGenerateContent({
      apiKey,
      baseUrl,
      model,
      requestBody,
      signal,
    });

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No candidates in response");

    const content = candidate.content;
    if (!content) throw new Error("No content in candidate");

    const parts = content.parts || [];
    const functionCallPart = parts.find((p: any) => p.function_call);

    if (functionCallPart) {
      const result = await executeTool(functionCallPart.function_call, brandId!, supabase!, geminiKey!);
      contents.push({ role: "model", parts: content.parts });
      contents.push({
        role: "user",
        parts: [{
          function_response: {
            name: functionCallPart.function_call.name,
            response: { result },
          },
        }],
      });
    } else {
      const streamRequestBody = buildGeminiStreamGenerateContentRequestBody({
        systemInstruction,
        input: "",
        tools,
      });
      (streamRequestBody as any).contents = contents;

      const streamResponse = await postStreamGenerateContent({
        apiKey,
        baseUrl,
        model,
        requestBody: streamRequestBody,
        signal,
      });

      if (!streamResponse.body) throw new Error("No response body");

      return streamResponse.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream({
          transform(chunk, controller) {
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  const text = extractGeminiChunkText(data);
                  if (text) controller.enqueue(text);
                } catch {
                }
              }
            }
          }
        }));
    }
  }
}

function makeCombinedSignal(externalSignal: AbortSignal, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const combined = new AbortController();
  const timer = setTimeout(() => combined.abort(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);

  const onExternalAbort = () => combined.abort(externalSignal.reason);
  externalSignal.addEventListener("abort", onExternalAbort, { once: true });

  const cleanup = () => {
    clearTimeout(timer);
    externalSignal.removeEventListener("abort", onExternalAbort);
  };

  return { signal: combined.signal, cleanup };
}

async function postGenerateContent({
  apiKey,
  baseUrl,
  model,
  requestBody,
  signal,
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  requestBody: unknown;
  signal: AbortSignal;
}): Promise<any> {
  const url = new URL(`/v1beta/models/${model}:generateContent`, baseUrl);
  const { signal: combinedSignal, cleanup } = makeCombinedSignal(signal, 30_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: combinedSignal,
    });

    if (!response.ok) {
      let details = `${response.status}`;
      try {
        const errorText = await response.text();
        if (errorText) details += ` ${errorText}`;
      } catch {
        // ignore
      }
      throw new Error(`Gemini API error: ${details}`.trim());
    }

    return await response.json();
  } finally {
    cleanup();
  }
}

async function postStreamGenerateContent({
  apiKey,
  baseUrl,
  model,
  requestBody,
  signal,
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  requestBody: unknown;
  signal: AbortSignal;
}): Promise<Response> {
  const url = new URL(`/v1beta/models/${model}:streamGenerateContent`, baseUrl);
  url.searchParams.set("alt", "sse");
  const { signal: combinedSignal, cleanup } = makeCombinedSignal(signal, 30_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: combinedSignal,
    });

    if (response.ok) return response;

    let details = `${response.status}`;
    try {
      const errorText = await response.text();
      if (errorText) details += ` ${errorText}`;
    } catch {
      // ignore
    }
    throw new Error(`Gemini API error: ${details}`.trim());
  } finally {
    cleanup();
  }
}

export function buildGeminiStreamGenerateContentRequestBody({
  systemInstruction,
  input,
  toolsMode,
  tools,
}: {
  systemInstruction: string;
  input: string;
  toolsMode?: GeminiRequestToolsMode;
  tools?: unknown[];
}) {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: input }] }],
    generationConfig: {
      temperature: 0.65,
      maxOutputTokens: 2500,
    },
  };

  if (tools) {
    body.tools = tools;
  } else {
    if (toolsMode === "url_context_and_search") body.tools = [{ url_context: {} }, { google_search: {} }];
    if (toolsMode === "search_only") body.tools = [{ google_search: {} }];
  }
  return body;
}
