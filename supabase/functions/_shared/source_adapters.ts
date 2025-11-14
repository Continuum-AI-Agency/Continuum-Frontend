// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type FetchInput = {
  source:
    | "upload"
    | "google-drive"
    | "canva"
    | "figma"
    | "sharepoint"
    | "notion"
    | "website";
  storagePath?: string;
  externalUrl?: string;
};

function createSupabase() {
  const url = Deno.env.get("SUPABASE_URL");
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

async function fetchFromStorage(path?: string): Promise<Uint8Array> {
  if (!path) throw new Error("storagePath required");
  const supabase = createSupabase();
  const bucket = "brand-docs";
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  const buf = new Uint8Array(await data.arrayBuffer());
  return buf;
}

async function fetchFromGoogleDrive(url?: string): Promise<Uint8Array> {
  if (!url) throw new Error("externalUrl required");
  // Expect alt=media for blob files, or export links for Docs/Sheets
  // Ref: https://developers.google.com/workspace/drive/api/guides/manage-downloads
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf;
}

export async function fetchBytes(input: FetchInput): Promise<Uint8Array> {
  if (input.source === "upload") {
    return fetchFromStorage(input.storagePath);
  }
  if (input.source === "google-drive") {
    // For parity, we can optionally persist to Storage first in the pipeline layer
    return fetchFromGoogleDrive(input.externalUrl);
  }
  // Stubs for future providers
  if (input.source === "website") {
    return fetchFromGoogleDrive(input.externalUrl); // plain fetch; same signature
  }
  throw new Error(`Source adapter not implemented: ${input.source}`);
}


