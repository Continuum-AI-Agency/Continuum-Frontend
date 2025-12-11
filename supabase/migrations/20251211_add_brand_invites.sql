-- Create invites table for brand onboarding magic links
create table if not exists brand_profiles.invites (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','admin','operator','viewer')),
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

-- RLS: only owners/admins of a brand can manage invites for that brand
alter table brand_profiles.invites enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'brand_profiles' and tablename = 'invites' and policyname = 'Manage invites (owner/admin)'
  ) then
    create policy "Manage invites (owner/admin)"
      on brand_profiles.invites
      for all
      to authenticated
      using (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = brand_profiles.invites.brand_profile_id
            and p.user_id = auth.uid()
            and p.role in ('owner','admin')
        )
      )
      with check (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = brand_profiles.invites.brand_profile_id
            and p.user_id = auth.uid()
            and p.role in ('owner','admin')
        )
      );
  end if;
end $$;

create index if not exists idx_invites_brand_email on brand_profiles.invites (brand_profile_id, email);
