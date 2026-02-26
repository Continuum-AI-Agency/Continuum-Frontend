import { NextRequest, NextResponse } from "next/server";

import {
  campaignIndexCreateSchema,
  type CampaignIndexRecord,
} from "@/lib/paid-media/campaign-indexes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CAMPAIGN_INDEX_TABLE = "paid_media_campaign_indexes" as never;

type CampaignIndexRow = {
  id: string;
  brand_id: string;
  meta_account_id: string;
  name: string;
  campaign_ids: string[];
  created_at: string;
  updated_at: string;
};

type CampaignIndexInsertPayload = Pick<
  CampaignIndexRow,
  "brand_id" | "meta_account_id" | "name" | "campaign_ids"
>;

function normalizeCampaignIndexRow(input: unknown): CampaignIndexRecord | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;

  if (
    typeof row.id !== "string" ||
    typeof row.brand_id !== "string" ||
    typeof row.meta_account_id !== "string" ||
    typeof row.name !== "string" ||
    !Array.isArray(row.campaign_ids) ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    brandId: row.brand_id,
    metaAccountId: row.meta_account_id,
    name: row.name,
    campaignIds: row.campaign_ids.filter((value): value is string => typeof value === "string"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get("brandId");
  const metaAccountId = request.nextUrl.searchParams.get("metaAccountId");

  if (!brandId || !metaAccountId) {
    return NextResponse.json({ error: "brandId and metaAccountId are required" }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .schema("brand_profiles")
      .from(CAMPAIGN_INDEX_TABLE)
      .select("id, brand_id, meta_account_id, name, campaign_ids, created_at, updated_at")
      .eq("brand_id", brandId)
      .eq("meta_account_id", metaAccountId)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const indexes = (Array.isArray(data) ? data : [])
      .map((row) => normalizeCampaignIndexRow(row as CampaignIndexRow))
      .filter((value): value is CampaignIndexRecord => value !== null);

    return NextResponse.json({ indexes }, { status: 200 });
  } catch (error) {
    console.error("Failed to list campaign indexes", error);
    return NextResponse.json({ error: "Failed to list campaign indexes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = campaignIndexCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload: CampaignIndexInsertPayload = {
      brand_id: parsed.data.brandId,
      meta_account_id: parsed.data.metaAccountId,
      name: parsed.data.name.trim(),
      campaign_ids: Array.from(new Set(parsed.data.campaignIds)),
    };

    const { data, error } = await supabase
      .schema("brand_profiles")
      .from(CAMPAIGN_INDEX_TABLE)
      .insert(payload as never)
      .select("id, brand_id, meta_account_id, name, campaign_ids, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const index = normalizeCampaignIndexRow(data as CampaignIndexRow);
    if (!index) {
      return NextResponse.json({ error: "Invalid campaign index response" }, { status: 502 });
    }

    return NextResponse.json({ index }, { status: 201 });
  } catch (error) {
    console.error("Failed to create campaign index", error);
    return NextResponse.json({ error: "Failed to create campaign index" }, { status: 500 });
  }
}
