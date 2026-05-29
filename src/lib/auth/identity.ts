// Canonical authenticated-user shape used across server components, brand
// context, and providers. Sourced from the native Supabase session claims.

export type AuthIdentityAppMetadata = {
  provider?: string;
  providers?: string[];
  [key: string]: unknown;
};

export type AuthIdentityUserMetadata = {
  full_name?: string;
  avatar_url?: string;
  has_password?: boolean;
  [key: string]: unknown;
};

export type AuthIdentity = {
  id: string;
  email?: string;
  app_metadata?: AuthIdentityAppMetadata;
  user_metadata?: AuthIdentityUserMetadata;
};
