// deno-lint-ignore-file no-explicit-any
// @ts-nocheck
// Edge function: embed_document
// - Accepts JSON { brandId, documentId, source, storagePath?, externalUrl?, mimeType?, fileName? }
// - Returns 202 with { jobId, documentId }
// - Kicks off background processing (fetch bytes → extract → chunk → embed → store)
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
    externalUrl: z.string().url().optional(),
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

const OPENAI_MODEL = "text-embedding-3-small";
const OPENAI_BATCH_LIMIT = 64;

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
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  const endpoint = Deno.env.get("OPENAI_BASE_URL")?.trim() || "https://api.openai.com/v1/embeddings";
  const body = {
    input: inputs,
    model: OPENAI_MODEL,
    encoding_format: "float",
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI embedding failed: ${response.status} ${message}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding: number[] }>;
    error?: { message?: string };
  };

  if (!payload.data?.length) {
    const errMessage = payload.error?.message ?? "Empty embedding response";
    throw new Error(errMessage);
  }

  return payload.data.map((item) => item.embedding);
}

async function processDocument(input: z.infer<typeof InputSchema>, authHeader?: string | null) {
  const supabase = createSupabase(authHeader);

  // Step 1: Acquire bytes
  const bytes = await fetchBytes({
    source: input.source,
    storagePath: input.storagePath,
    externalUrl: input.externalUrl,
  });

  // Step 2: Extract text
  const { text, mimeType, fileName } = await extractText(bytes, {
    mimeType: input.mimeType,
    fileName: input.fileName,
  });

  // Step 3: Chunk & sanitize (remove null bytes that Postgres rejects)
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
  const safeFileName = sanitize(fileName ?? "document");

  // Step 4: Embed chunks with OpenAI
  let embeddings: number[][] = [];
  if (chunks.length > 0) {
    try {
      const batchResults: number[][] = [];
      for (let i = 0; i < chunks.length; i += OPENAI_BATCH_LIMIT) {
        const slice = chunks.slice(i, i + OPENAI_BATCH_LIMIT);
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

  // Step 5: Persist (best-effort; tables may not exist yet)
  try {
    // Ensure a brand_documents row exists (upsert by PK)
    const baseDoc = {
      id: input.documentId,
      brand_id: input.brandId,
      name: safeFileName,
      source: input.source,
      status: "processing",
      storage_path: input.storagePath,
      external_url: input.externalUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: upsertErr } = await supabase
      .schema("brand_profiles")
      .from("brand_documents")
      // @ts-ignore deno types don't know upsert options
      .upsert(baseDoc, { onConflict: "id" });
    if (upsertErr) console.warn("Doc upsert error", upsertErr.message);
    // Insert chunks in batches of 100
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
      // @ts-ignore - vector type is supported server-side
      const { error } = await supabase
        .schema("brand_profiles")
        .from("brand_document_chunks")
        .insert(rows);
      if (error) console.warn("Insert chunk batch error", error.message);
    }

    const { error: updateErr } = await supabase
      .schema("brand_profiles")
      .from("brand_documents")
      .update({ status: "ready", mime_type: mimeType, updated_at: new Date().toISOString() })
      .eq("id", input.documentId);
    if (updateErr) console.warn("Update document status error", updateErr.message);

    // Optional: broadcast realtime event via Postgres triggers or here
  } catch (err) {
    console.error("Persist error:", err);
    await supabase
      .schema("brand_profiles")
      .from("brand_documents")
      .update({ status: "error", error_message: String(err) })
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


