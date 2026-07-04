import { createSupabaseServerClient } from '@/lib/supabase/server';

type SupabaseSession = {
  access_token: string;
};

type SupabaseSessionResult = {
  data: { session: SupabaseSession | null };
  error: Error | null;
};

type SupabaseFunctionResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

export type SupabaseFunctionClient = {
  auth: {
    getSession: () => Promise<SupabaseSessionResult>;
  };
  functions: {
    invoke: <T>(
      name: string,
      options: { body: { brandId: string }; headers?: Record<string, string> },
    ) => Promise<SupabaseFunctionResult<T>>;
  };
};

export type BrandProfileDetails = {
  id: string;
  name: string;
  logoPath: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  completedAt: string | null;
  emailReportOptIn: boolean;
};

export async function fetchBrandProfileDetails(
  brandId: string,
): Promise<BrandProfileDetails | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('brand_profiles')
    .select(
      'id, brand_name, logo_path, created_at, updated_at, created_by, completed_at, email_report_opt_in',
    )
    .eq('id', brandId)
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
    logoPath: data.logo_path ?? null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by,
    completedAt: data.completed_at,
    emailReportOptIn: (data as { email_report_opt_in?: boolean }).email_report_opt_in ?? true,
  };
}

export async function invokeDeleteBrandProfile(
  brandId: string,
  client?: SupabaseFunctionClient,
): Promise<void> {
  const supabase = client ?? (await createSupabaseServerClient());

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`Unable to read session: ${sessionError.message}`);
  }

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('Missing session access token');
  }

  const { data, error } = await supabase.functions.invoke('delete_brand_profile', {
    body: { brandId },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data && typeof data === 'object' && 'error' in data) {
    const message = typeof data.error === 'string' ? data.error : 'Unable to delete brand profile.';
    throw new Error(message);
  }
}
