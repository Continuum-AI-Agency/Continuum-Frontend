import { redirect } from "next/navigation";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AdminUserList, type AdminUser, type PermissionRow } from "@/components/admin/AdminUserList";

type AdminData = { users: AdminUser[]; permissions: PermissionRow[]; loadError?: string };

async function fetchAdminUsers(): Promise<AdminData> {
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

  const shouldCallEdge = process.env.NEXT_PUBLIC_ENABLE_ADMIN_EDGE === "true";
  if (!shouldCallEdge) {
    return { users: [], permissions: [], loadError: "Admin edge functions are disabled. Deploy and enable to load data." };
  }

  const { data, error } = await server.functions.invoke<{ users: AdminUser[]; permissions: PermissionRow[] }>(
    "admin-list-users",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (error) {
    return {
      users: [],
      permissions: [],
      loadError: error.message ?? "Failed to load admin data (edge function error).",
    };
  }

  return data ?? { users: [], permissions: [] };
}

export default async function AdminPage() {
  const { users, permissions, loadError } = await fetchAdminUsers();

  return (
    <div className="py-8 px-4 sm:px-8 w-full max-w-[1400px] mx-auto">
      <Flex direction="column" gap="5">
        <div>
          <Heading size="7">Admin</Heading>
          <Text color="gray">Manage users, impersonate, and adjust tiers.</Text>
        </div>
        <GlassPanel className="p-5">
          {loadError ? (
            <Text color="red" className="mb-3">
              {loadError}
            </Text>
          ) : null}
          <AdminUserList users={users} permissions={permissions} />
        </GlassPanel>
      </Flex>
    </div>
  );
}
