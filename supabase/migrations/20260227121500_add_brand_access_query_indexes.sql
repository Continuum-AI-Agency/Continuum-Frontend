-- Performance indexes for active brand resolution and onboarding document sync paths.

create index if not exists idx_permissions_user_brand_include_role
  on brand_profiles.permissions (user_id, brand_profile_id) include (role);

create index if not exists idx_invites_email_expires_pending
  on brand_profiles.invites (email, expires_at)
  where accepted_at is null and revoked_at is null;

create index if not exists idx_brand_documents_brand_created_at
  on brand_profiles.brand_documents (brand_id, created_at);
