"use client";

import { useMutation } from "@tanstack/react-query";
import {
  updateBrandIntegrationAccountsInputSchema,
  updateBrandIntegrationAccountsResponseSchema,
  type UpdateBrandIntegrationAccountsInput,
  type UpdateBrandIntegrationAccountsResponse,
} from "@/lib/schemas/brandIntegrations";

export async function updateBrandIntegrationAssignments(
  input: UpdateBrandIntegrationAccountsInput
): Promise<UpdateBrandIntegrationAccountsResponse> {
  const body = updateBrandIntegrationAccountsInputSchema.parse(input);
  const response = await fetch("/api/brand-integrations/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Failed to update brand integrations.");
  }

  const json = (await response.json()) as unknown;
  return updateBrandIntegrationAccountsResponseSchema.parse(json);
}

export function useUpdateBrandIntegrationAssignments() {
  return useMutation({
    mutationFn: (input: UpdateBrandIntegrationAccountsInput) =>
      updateBrandIntegrationAssignments(input),
  });
}

