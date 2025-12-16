import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  updateBrandIntegrationAccountsInputSchema,
  updateBrandIntegrationAccountsResponseSchema,
} from "@/lib/schemas/brandIntegrations";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateBrandIntegrationAccountsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  let authHeader: Record<string, string> | undefined;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeader = { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    authHeader = undefined;
  }

  const { data, error } = await supabase.functions.invoke(
    "update_brand_integration_accounts",
    {
      body: parsed.data,
      headers: authHeader,
    }
  );

  if (error) {
    console.error(
      "[brand-integrations/assignments] update_brand_integration_accounts invoke failed",
      error
    );
    return NextResponse.json(
      { error: "Failed to update brand integrations" },
      { status: 500 }
    );
  }

  try {
    const response = updateBrandIntegrationAccountsResponseSchema.parse(data);
    return NextResponse.json(response);
  } catch (parseError) {
    console.error(
      "[brand-integrations/assignments] invalid edge response",
      parseError
    );
    return NextResponse.json(
      { error: "Invalid update response" },
      { status: 500 }
    );
  }
}

