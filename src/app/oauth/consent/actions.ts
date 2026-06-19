"use server";

import { getServerSession } from "@/lib/supabase/server";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { getApiUrl } from "@/lib/api/config";
import { resolveConfirmBrandId } from "./brandSelection";

export type ConfirmMcpRegistrationInput = {
  authorizationId: string;
  clientId: string;
  clientName?: string | null;
  scope?: string | null;
  /** User-selected brand to bind the connector to; validated server-side. */
  brandId?: string | null;
};

export type ConfirmMcpRegistrationResult = {
  registered: boolean;
  brandId: string | null;
  error?: string;
};

export type ConsentBrandOption = { id: string; name: string };

export type ListConsentBrandsResult = {
  brands: ConsentBrandOption[];
  activeBrandId: string | null;
};

/**
 * List the brands the authorizing user can bind a connector to, plus their
 * current active brand (the picker default), for the OAuth consent screen.
 */
export async function listConsentBrandsAction(): Promise<ListConsentBrandsResult> {
  try {
    const context = await getActiveBrandContext();
    return {
      brands: context.brandSummaries
        .filter((brand) => !brand.isPending)
        .map((brand) => ({ id: brand.id, name: brand.name })),
      activeBrandId: context.activeBrandId,
    };
  } catch {
    return { brands: [], activeBrandId: null };
  }
}

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
    brandId = resolveConfirmBrandId(
      input.brandId,
      context.brandSummaries.map((brand) => brand.id),
      context.activeBrandId
    );
  } catch {
    // The backend confirm endpoint re-verifies brand access, so a requested
    // brand is safe to forward even if the context lookup failed.
    brandId = input.brandId ?? null;
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
