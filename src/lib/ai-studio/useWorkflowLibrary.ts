"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  mapWorkflowLibraryRow,
  workflowLibraryRowSchema,
  type WorkflowLibraryItem,
} from "@/lib/schemas/workflowLibrary";

async function fetchWorkflowLibrary(): Promise<WorkflowLibraryItem[]> {
  const supabase = createSupabaseBrowserClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("workflow_library")
    .select("id, name, description, content, tags, created_at, updated_at")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message ?? "Failed to load workflow library");
  return (data ?? []).map((row: unknown) =>
    mapWorkflowLibraryRow(workflowLibraryRowSchema.parse(row))
  );
}

export function useWorkflowLibrary(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: ["workflow-library"],
    queryFn: fetchWorkflowLibrary,
    enabled: options?.enabled ?? true,
    staleTime: 30 * 60 * 1000,
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
