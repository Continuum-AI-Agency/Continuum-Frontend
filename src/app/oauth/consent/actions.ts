"use server";

import { getServerSession } from "@/lib/supabase/server";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { getApiUrl } from "@/lib/api/config";

export type ConfirmMcpRegistrationInput = {
  authorizationId: string;
  clientId: string;
  clientName?: string | null;
  scope?: string | null;
};

export type ConfirmMcpRegistrationResult = {
  registered: boolean;
  brandId: string | null;
  error?: string;
};

/**
 * Records, app-side, that the user authorized an MCP connector at OAuth approval
 * time (the confirm-only post-approval exchange). Runs on the Next.js server so
 * it can attach the user's Supabase JWT and resolve the active brand, then asks
 * the MCP backend to persist the connection. The web app, not a backend URL,
 * owns this exchange — only the code→token step stays client↔Supabase.
 */
export async function confirmMcpRegistrationAction(
  input: ConfirmMcpRegistrationInput
): Promise<ConfirmMcpRegistrationResult> {
  const session = await getServerSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    return { registered: false, brandId: null, error: "not_authenticated" };
  }
  if (!input.clientId || input.clientId.trim().length === 0) {
    return { registered: false, brandId: null, error: "missing_client_id" };
  }

  let brandId: string | null = null;
  try {
    const context = await getActiveBrandContext();
    brandId = context.activeBrandId;
  } catch {
    brandId = null;
  }

  try {
    const response = await fetch(getApiUrl("/mcp/connections/confirm"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        authorization_id: input.authorizationId,
        client_id: input.clientId,
        client_name: input.clientName ?? null,
        scope: input.scope ?? null,
        brand_id: brandId,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      return { registered: false, brandId, error: `backend_${response.status}` };
    }
    return { registered: true, brandId };
  } catch {
    return { registered: false, brandId, error: "request_failed" };
  }
}
