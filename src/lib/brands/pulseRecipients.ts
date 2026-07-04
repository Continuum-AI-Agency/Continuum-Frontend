import { createSupabaseServerClient } from '@/lib/supabase/server';

export type PulseRecipient = {
  userId: string;
  email: string | null;
  role: string;
  receivesEmailReport: boolean;
};

// The brand members and whether each is tagged to receive the Continuum Pulse.
// The brand owner (brand_profiles.created_by) always receives it when the report
// is enabled, so the UI shows their row as always-on.
export async function fetchPulseRecipients(brandId: string): Promise<PulseRecipient[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .schema('brand_profiles')
    .from('permissions')
    .select('user_id, email, role, receives_email_report')
    .eq('brand_profile_id', brandId)) as {
    data: Array<{
      user_id: string;
      email: string | null;
      role: string;
      receives_email_report: boolean | null;
    }> | null;
    error: { message: string } | null;
  };

  if (error) {
    console.error(`[pulse] Failed to fetch recipients for brand ${brandId}`, error);
    return [];
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    email: row.email,
    role: row.role,
    receivesEmailReport: row.receives_email_report === true,
  }));
}
