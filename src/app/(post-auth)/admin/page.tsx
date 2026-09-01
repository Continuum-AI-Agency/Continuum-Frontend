import { redirect } from 'next/navigation';
import { AdminUserList } from '@/components/admin/AdminUserList';
import type {
  AdminListResponse,
  AdminPagination,
  AdminUser,
  PermissionRow,
} from '@/components/admin/adminUserTypes';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { isAdminUser } from '@/lib/brands/brand-switcher-utils';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type AdminData = {
  users: AdminUser[];
  permissions: PermissionRow[];
  pagination: AdminPagination;
  loadError?: string;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parseNumericParam(value: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function parseStringParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw : '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function fetchAdminUsers(params: {
  page: number;
  pageSize: number;
  query?: string;
}): Promise<AdminData> {
  const server = await createSupabaseServerClient();
  const { data: userData, error: userError } = await server.auth.getUser();
  if (userError || !userData?.user) {
    redirect('/login');
  }

  if (!isAdminUser(userData.user)) {
    redirect('/'); // guard
  }

  const { data: sessionData } = await server.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    redirect('/login');
  }

  const trimmedQuery = params.query?.trim();
  const { data, error } = await server.functions.invoke<AdminListResponse>('admin-list-users', {
    method: 'POST',
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
      loadError: error.message ?? 'Failed to load admin data (edge function error).',
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
    parseNumericParam(
      resolvedSearchParams.pageSize ?? resolvedSearchParams.perPage,
      DEFAULT_PAGE_SIZE,
    ),
    1,
    MAX_PAGE_SIZE,
  );
  const query = parseStringParam(resolvedSearchParams.query).trim();

  const { users, permissions, pagination, loadError } = await fetchAdminUsers({
    page,
    pageSize,
    query,
  });

  return (
    <div className="flex h-[var(--app-content-h)] min-h-0 w-full max-w-none flex-col overflow-hidden px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <div className="shrink-0 space-y-1 pb-[var(--page-section-gap)]">
        <h1 className="text-xl font-semibold text-primary">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage users, brand access, global workflow library promotion, and brand canvas workflow
          transfers.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden overscroll-contain">
        <Card className="glass-panel border-subtle shadow-brand-glow h-full py-0">
          <CardContent className="flex h-full min-h-0 flex-col p-[var(--card-pad)]">
            {loadError ? (
              <Alert variant="destructive" className="mb-4 shrink-0">
                <AlertTitle>Unable to load admin data</AlertTitle>
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            ) : null}
            <AdminUserList
              users={users}
              permissions={permissions}
              pagination={pagination}
              searchQuery={query}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
