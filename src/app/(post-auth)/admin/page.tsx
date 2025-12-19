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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function fetchAdminUsers(params: { page: number; pageSize: number }): Promise<AdminData> {
  const server = await createSupabaseServerClient();
  const { data: sessionData } = await server.auth.getSession();
  const session = sessionData?.session;
  const isAdmin = Boolean(session?.user?.app_metadata?.is_admin);
  if (!isAdmin) {
    redirect("/"); // guard
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    redirect("/login");
  }

  const { data, error } = await server.functions.invoke<AdminListResponse>("admin-list-users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      page: params.page,
      perPage: params.pageSize,
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
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const page = Math.max(1, parseNumericParam(searchParams?.page, 1));
  const pageSize = clamp(
    parseNumericParam(searchParams?.pageSize ?? searchParams?.perPage, DEFAULT_PAGE_SIZE),
    1,
    MAX_PAGE_SIZE
  );

  const { users, permissions, pagination, loadError } = await fetchAdminUsers({ page, pageSize });

  return (
    <div className="py-10 w-full max-w-none px-3 sm:px-4 lg:px-6">
      <Flex direction="column" gap="6">
        <div>
          <Heading size="8">Admin</Heading>
          <Text color="gray" size="3">Manage users, impersonate, and adjust tiers.</Text>
        </div>
        <GlassPanel className="p-6 lg:p-8">
          {loadError ? (
            <Text color="red" className="mb-3">
              {loadError}
            </Text>
          ) : null}
          <AdminUserList users={users} permissions={permissions} pagination={pagination} />
        </GlassPanel>
      </Flex>
    </div>
  );
}
