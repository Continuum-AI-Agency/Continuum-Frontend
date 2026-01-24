import { computeTextDelta, extractGeminiChunkText } from "./geminiStream.ts";

// --- Tool Execution ---

async function createEmbedding(input: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input,
      model: "text-embedding-3-small",
    }),
  });
  if (!response.ok) throw new Error("Failed to create embedding");
  const data = await response.json();
  return data.data[0].embedding;
}

async function searchBrandDocs(brandId: string, query: string, openaiKey: string, supabase: any) {
  if (!openaiKey) return "No embedding key available.";
  try {
    const embedding = await createEmbedding(query, openaiKey);
    const { data: chunks, error } = await supabase.rpc("match_brand_documents", {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 5,
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

async function executeTool(functionCall: any, brandId: string, supabase: any, openaiKey: string): Promise<any> {
  if (functionCall.name === "search_brand_documents") {
    const query = functionCall.args.query;
    return await searchBrandDocs(brandId, query, openaiKey, supabase);
  }
  throw new Error(`Unknown tool: ${functionCall.name}`);
}

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
  openaiKey?: string; // for tool execution
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
  openaiKey,
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

  while (true) {
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
      const result = await executeTool(functionCallPart.function_call, brandId!, supabase!, openaiKey!);
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
    signal,
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
    signal,
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
      temperature: 0.2,
      maxOutputTokens: 1200,
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

