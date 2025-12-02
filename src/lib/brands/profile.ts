import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BrandProfileDetails = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export async function fetchBrandProfileDetails(brandId: string): Promise<BrandProfileDetails | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("brand_profiles")
    .select("id, brand_name, created_at, updated_at, created_by")
    .eq("id", brandId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    name: data.brand_name,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by,
  };
}

export async function invokeDeleteBrandProfile(brandId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.functions.invoke("delete_brand_profile", {
    body: { brandId },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data && typeof data === "object" && "error" in data) {
    const message = typeof data.error === "string" ? data.error : "Unable to delete brand profile.";
    throw new Error(message);
  }
}
