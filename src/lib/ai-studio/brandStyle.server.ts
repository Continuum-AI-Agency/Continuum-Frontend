"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BrandStyle = {
    colors: string[];
    typography: { primary: string | null; secondary: string | null };
};

export async function fetchBrandStyle(brandId: string): Promise<BrandStyle> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
        .schema("brand_profiles")
        .from("brand_profiles")
        .select("brand_colors, brand_typography")
        .eq("id", brandId)
        .maybeSingle();

    if (!data) return { colors: [], typography: { primary: null, secondary: null } };

    const colors = Array.isArray(data.brand_colors)
        ? (data.brand_colors as unknown[]).filter((c): c is string => typeof c === "string")
        : [];

    const typo = (data.brand_typography ?? {}) as Record<string, unknown>;
    return {
        colors,
        typography: {
            primary: typeof typo.primary === "string" ? typo.primary : null,
            secondary: typeof typo.secondary === "string" ? typo.secondary : null,
        },
    };
}
