"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { BrandSummary } from "@/components/DashboardLayoutShell";

const USER_BRANDS_PAGE_SIZE = 20;
const LOGO_SIGNED_URL_TTL_SECONDS = 604800;

export type UserBrandListItem = BrandSummary & {
  role: string | null;
};

type UserBrandPermissionRow = {
  brand_profile_id: string;
  role: string | null;
};

type UserBrandAccessRow = UserBrandPermissionRow & {
  isPending: boolean;
};

type UserBrandProfileRow = {
  id: string;
  brand_name: string | null;
  logo_path: string | null;
  completed_at: string | null;
};

type UserBrandPage = {
  brands: UserBrandListItem[];
  nextPage: number | null;
};

type FetchUserBrandPageParams = {
  userId: string;
  userEmail?: string | null;
  page: number;
  pageSize?: number;
};

async function signLogoUrls(
  supabase: ReturnType<typeof import("@/lib/supabase/client").createSupabaseBrowserClient>,
  logoPaths: string[]
): Promise<Map<string, string>> {
  const uniquePaths = Array.from(new Set(logoPaths.filter(Boolean)));
  if (uniquePaths.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.storage
    .from("brand-profile-assets")
    .createSignedUrls(uniquePaths, LOGO_SIGNED_URL_TTL_SECONDS);

  if (error) {
    return new Map();
  }

  return new Map(
    (data ?? []).flatMap((item): Array<[string, string]> => {
      if (!item.path || !item.signedUrl) {
        return [];
      }

      return [[item.path, item.signedUrl]];
    })
  );
}

async function fetchUserBrandPage({
  userId,
  userEmail,
  page,
  pageSize = USER_BRANDS_PAGE_SIZE,
}: FetchUserBrandPageParams): Promise<UserBrandPage> {
  const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
  const supabase = createSupabaseBrowserClient();
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const permissionsQuery = supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("brand_profile_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);
  const invitesQuery = page === 0 && userEmail
    ? supabase
        .schema("brand_profiles")
        .from("invites")
        .select("brand_profile_id, role")
        .eq("email", userEmail)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
    : Promise.resolve({ data: [] as UserBrandPermissionRow[], error: null });

  const [
    { data: permissionRows, error: permissionsError },
    { data: inviteRows, error: invitesError },
  ] = await Promise.all([permissionsQuery, invitesQuery]);

  if (permissionsError) {
    throw permissionsError;
  }
  if (invitesError) {
    throw invitesError;
  }

  const permissions = (permissionRows ?? []) as UserBrandPermissionRow[];
  const permissionIds = new Set(permissions.map((row) => row.brand_profile_id));
  const accessRows: UserBrandAccessRow[] = [
    ...permissions.map((row) => ({ ...row, isPending: false })),
    ...((inviteRows ?? []) as UserBrandPermissionRow[])
      .filter((row) => !permissionIds.has(row.brand_profile_id))
      .map((row) => ({ ...row, isPending: true })),
  ];
  const brandIds = accessRows.map((row) => row.brand_profile_id).filter(Boolean);

  if (brandIds.length === 0) {
    return { brands: [], nextPage: null };
  }

  const { data: brandRows, error: brandsError } = await supabase
    .schema("brand_profiles")
    .from("brand_profiles")
    .select("id, brand_name, logo_path, completed_at")
    .in("id", brandIds)
    // Exclude soft-deleted brands (active=false) so a deleted brand does not
    // reappear in the paginated brand list.
    .eq("active", true);

  if (brandsError) {
    throw brandsError;
  }

  const profiles = new Map(
    ((brandRows ?? []) as UserBrandProfileRow[]).map((brand) => [brand.id, brand])
  );
  const signedUrls = await signLogoUrls(
    supabase,
    ((brandRows ?? []) as UserBrandProfileRow[])
      .map((brand) => brand.logo_path)
      .filter((path): path is string => Boolean(path))
  );

  const brands = accessRows.flatMap<UserBrandListItem>((permission) => {
    const profile = profiles.get(permission.brand_profile_id);
    if (!profile) {
      return [];
    }

    const logoPath = profile.logo_path ?? null;
    return [
      {
        id: profile.id,
        name: profile.brand_name ?? "Untitled brand",
        completed: profile.completed_at !== null,
        logoPath,
        logoUrl: logoPath ? signedUrls.get(logoPath) ?? null : null,
        isPending: permission.isPending,
        role: permission.role,
      },
    ];
  });

  return {
    brands,
    nextPage: permissions.length === pageSize ? page + 1 : null,
  };
}

type UseInfiniteUserBrandsOptions = {
  userId?: string | null;
  userEmail?: string | null;
};

export function useInfiniteUserBrands({ userId, userEmail }: UseInfiniteUserBrandsOptions) {
  const query = useInfiniteQuery({
    queryKey: ["settings-user-brands", userId, userEmail],
    queryFn: ({ pageParam }) =>
      userId
        ? fetchUserBrandPage({ userId, userEmail, page: pageParam })
        : Promise.resolve({ brands: [], nextPage: null }),
    enabled: Boolean(userId),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  return {
    brands: query.data?.pages.flatMap((page) => page.brands) ?? [],
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
  };
}
