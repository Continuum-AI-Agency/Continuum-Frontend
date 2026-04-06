// deno-lint-ignore-file no-explicit-any
// Edge function: embed_document
// - Accepts JSON { brandId, documentId, source, storagePath?, externalUrl?, mimeType?, fileName? }
// - Returns 202 with { jobId, documentId }
// - Kicks off background processing (fetch bytes → extract → chunk → embed → store)
//
// Notes
// - This is an extensible, adapter-driven pipeline. Only minimal stubs are provided.
// - Uses Gemini gemini-embedding-001 via REST API.
// - Dimensions: 1536 (to match existing schema).
//
// Notes
// - This is an extensible, adapter-driven pipeline. Only minimal stubs are provided.
// - When wiring real embedding, use your provider of choice and batch inserts into pgvector.

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { fetchBytes } from "../_shared/source_adapters.ts";
import { extractText } from "../_shared/extract.ts";
import { chunkText } from "../_shared/chunk.ts";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const InputSchema = z
  .object({
    brandId: z.string().min(1),
    documentId: z.string().min(1),
    source: z.enum([
      "upload",
      "google-drive",
      "canva",
      "figma",
      "sharepoint",
      "notion",
      "website",
    ]),
    storagePath: z.string().optional(),
    externalUrl: z.string().min(1).optional(),
    mimeType: z.string().optional(),
    fileName: z.string().optional(),
  })
  .refine(
    (v) => Boolean(v.storagePath || v.externalUrl),
    "Either storagePath or externalUrl is required"
  );

function jsonResponse(body: Record<string, JsonValue>, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const GEMINI_BATCH_LIMIT = 100;

function createSupabase(authHeader?: string | null) {
  const url = Deno.env.get("SUPABASE_URL");
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_*_KEY env vars");
  }
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers.Authorization = authHeader;
  }
  return createClient(url, key, {
    global: { headers },
  });
}

async function createEmbeddings(inputs: string[]): Promise<number[][]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents";
  const body = {
    requests: inputs.map((text) => ({
      model: "models/gemini-embedding-001",
      taskType: "RETRIEVAL_DOCUMENT",
      content: { parts: [{ text }] },
      outputDimensionality: 1536,
    })),
  };

  const response = await fetch(`${endpoint}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini embedding failed: ${response.status} ${message}`);
  }

  const payload = (await response.json()) as {
    embeddings?: Array<{ values: number[] }>;
    error?: { message?: string };
  };

  if (!payload.embeddings?.length) {
    const errMessage = payload.error?.message ?? "Empty embedding response";
    throw new Error(errMessage);
  }

  return payload.embeddings.map((item) => item.values);
}

async function processDocument(input: z.infer<typeof InputSchema>, authHeader?: string | null) {
  const supabase = createSupabase(authHeader);

  try {
    const baseDoc = {
      id: input.documentId,
      brand_id: input.brandId,
      name: input.fileName ?? "document",
      source: input.source,
      status: "processing",
      storage_path: input.storagePath,
      external_url: input.externalUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: initialUpsertErr } = await supabase
      .schema("brand_profiles")
      .from("brand_documents")
      .upsert(baseDoc, { onConflict: "id" } as any);
    if (initialUpsertErr) {
      console.error("Initial doc upsert error", initialUpsertErr.message);
      throw new Error(`Initial doc upsert failed: ${initialUpsertErr.message}`);
    }
  } catch (err) {
    console.error("Failed to perform initial document upsert:", err);
    throw err;
  }

  try {
    const bytes = await fetchBytes({
      source: input.source,
      storagePath: input.storagePath,
      externalUrl: input.externalUrl,
    }, supabase);

    const { text, mimeType, fileName } = await extractText(bytes, {
      mimeType: input.mimeType,
      fileName: input.fileName,
    });

    const sanitize = (value: string) =>
      value
        .replace(/[\u0000-\u001f\u007f]/g, (char) => {
          if (char === "\n" || char === "\r" || char === "\t") {
            return char;
          }
          return " ";
        })
        .replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u");
    const chunks = chunkText(text, { chunkSize: 2000, overlap: 200 }).map(sanitize);
    const safeFileName = sanitize(fileName ?? input.fileName ?? "document");

    let embeddings: number[][] = [];
    if (chunks.length > 0) {
      try {
        const batchResults: number[][] = [];
        for (let i = 0; i < chunks.length; i += GEMINI_BATCH_LIMIT) {
          const slice = chunks.slice(i, i + GEMINI_BATCH_LIMIT);
          const vectors = await createEmbeddings(slice);
          batchResults.push(...vectors);
        }
        embeddings = batchResults;
        if (embeddings.length !== chunks.length) {
          throw new Error(
            `Embedding count mismatch: expected ${chunks.length}, received ${embeddings.length}`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Embedding error:", message);
        await supabase
          .schema("brand_profiles")
          .from("brand_documents")
          .update({ status: "error", error_message: message, updated_at: new Date().toISOString() })
          .eq("id", input.documentId);
        throw new Error(message);
      }
    }

    const finalDoc = {
      id: input.documentId,
      name: safeFileName,
      mime_type: mimeType,
      updated_at: new Date().toISOString(),
    };
    
    const { error: updateDocErr } = await supabase
      .schema("brand_profiles")
      .from("brand_documents")
      .update(finalDoc)
      .eq("id", input.documentId);
    
    if (updateDocErr) console.warn("Doc final update error", updateDocErr.message);

    const { error: deleteChunksErr } = await supabase
      .schema("brand_profiles")
      .from("brand_document_chunks")
      .delete()
      .eq("document_id", input.documentId);
    if (deleteChunksErr) {
      console.warn("Failed to delete existing chunks", deleteChunksErr.message);
    }

    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const slice = chunks.slice(i, i + batchSize);
      const vectors = embeddings.slice(i, i + batchSize);
      const rows = slice.map((content, idx) => ({
        document_id: input.documentId,
        chunk_index: i + idx,
        content,
        embedding: vectors[idx],
      }));
      const { error } = await supabase
        .schema("brand_profiles")
        .from("brand_document_chunks")
        .insert(rows as any);
      if (error) {
        console.error("Insert chunk batch error", error.message);
        throw new Error(`Insert chunk batch failed: ${error.message}`);
      }
    }

    const { error: finalizeErr } = await supabase
      .schema("brand_profiles")
      .from("brand_documents")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", input.documentId);
    if (finalizeErr) console.warn("Finalize document status error", finalizeErr.message);
  } catch (err) {
    console.error("Processing error:", err);
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .schema("brand_profiles")
      .from("brand_documents")
      .update({ status: "error", error_message: message, updated_at: new Date().toISOString() })
      .eq("id", input.documentId);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }
  let payload: z.infer<typeof InputSchema>;
  try {
    const json = await req.json();
    const parsed = InputSchema.safeParse(json);
    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.message }, { status: 400 });
    }
    payload = parsed.data;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobId = crypto.randomUUID();

  // Kick off background work (best-effort). Edge runtime continues until completion.
  // If needed, move to a queue or use a scheduled task runner.
  const authHeader =
    req.headers.get("Authorization") ??
    req.headers.get("authorization") ??
    req.headers.get("sb-function-request-authorization");

  Promise.resolve()
    .then(() => processDocument(payload, authHeader))
    .catch((err) => console.error("embed_document job failed", err));



  return jsonResponse({ ok: true, jobId, documentId: payload.documentId }, { status: 202 });
});
