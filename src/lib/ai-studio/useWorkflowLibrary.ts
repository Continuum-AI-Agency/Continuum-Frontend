"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  mapWorkflowLibraryRow,
  workflowLibraryRowSchema,
  type WorkflowLibraryItem,
} from "@/lib/schemas/workflowLibrary";

type WorkflowLibraryQueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};

type WorkflowLibraryQuery = PromiseLike<WorkflowLibraryQueryResult> & {
  order: (column: string, options?: { ascending?: boolean }) => WorkflowLibraryQuery;
};

async function fetchGlobalWorkflowLibrary(): Promise<WorkflowLibraryItem[]> {
  const supabase = createSupabaseBrowserClient();
  const brandSchema = supabase.schema("brand_profiles") as unknown as {
    from: (table: "workflow_library") => {
      select: (columns: string) => WorkflowLibraryQuery;
    };
  };
  const { data, error } = await brandSchema
    .from("workflow_library")
    .select("id, name, description, content, tags, created_at, updated_at")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message ?? "Failed to load workflow library");
  return (data ?? []).map((row: unknown) =>
    mapWorkflowLibraryRow(workflowLibraryRowSchema.parse(row))
  );
}

async function fetchWorkflowLibrary(): Promise<WorkflowLibraryItem[]> {
  return fetchGlobalWorkflowLibrary();
}

export function useWorkflowLibrary(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: ["workflow-library", "global"],
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
