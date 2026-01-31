import { redirect } from "next/navigation";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AdminUserList } from "@/components/admin/AdminUserList";
import type { AdminListResponse, AdminPagination, AdminUser, PermissionRow } from "@/components/admin/adminUserTypes";

type AdminData = { users: AdminUser[]; permissions: PermissionRow[]; pagination: AdminPagination; loadError?: string };

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parseNumericParam(
  value: string | string[] | undefined,
  fallback: number
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function parseStringParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : "";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function fetchAdminUsers(params: { page: number; pageSize: number; query?: string }): Promise<AdminData> {
  const server = await createSupabaseServerClient();
  const { data: userData, error: userError } = await server.auth.getUser();
  if (userError || !userData?.user) {
    redirect("/login");
  }

  const isAdmin = Boolean((userData.user.app_metadata as Record<string, unknown> | undefined)?.is_admin);
  if (!isAdmin) {
    redirect("/"); // guard
  }

  const { data: sessionData } = await server.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    redirect("/login");
  }

  const trimmedQuery = params.query?.trim();
  const { data, error } = await server.functions.invoke<AdminListResponse>("admin-list-users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      page: params.page,
      perPage: params.pageSize,
      ...(trimmedQuery ? { query: trimmedQuery } : {}),
    },
  });

  if (error) {
    return {
      users: [],
      permissions: [],
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        totalCount: 0,
        totalPages: 0,
        nextPage: null,
        lastPage: 0,
        hasNextPage: false,
        hasPrevPage: params.page > 1,
      },
      loadError: error.message ?? "Failed to load admin data (edge function error).",
    };
  }

  return (
    data ?? {
      users: [],
      permissions: [],
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        totalCount: 0,
        totalPages: 0,
        nextPage: null,
        lastPage: 0,
        hasNextPage: false,
        hasPrevPage: params.page > 1,
      },
    }
  );
}

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const page = Math.max(1, parseNumericParam(resolvedSearchParams.page, 1));
  const pageSize = clamp(
    parseNumericParam(resolvedSearchParams.pageSize ?? resolvedSearchParams.perPage, DEFAULT_PAGE_SIZE),
    1,
    MAX_PAGE_SIZE
  );
  const query = parseStringParam(resolvedSearchParams.query).trim();

  const { users, permissions, pagination, loadError } = await fetchAdminUsers({ page, pageSize, query });

  return (
    <div className="py-10 w-full max-w-none px-3 sm:px-4 lg:px-6">
      <Flex direction="column" gap="6">
        <div>
          <Heading size="8">Admin</Heading>
          <Text color="gray" size="3">Manage users, impersonate, and adjust brand tiers.</Text>
        </div>
        <GlassPanel className="p-6 lg:p-8">
          {loadError ? (
            <Text color="red" className="mb-3">
              {loadError}
            </Text>
          ) : null}
          <AdminUserList users={users} permissions={permissions} pagination={pagination} searchQuery={query} />
        </GlassPanel>
      </Flex>
    </div>
  );
}
