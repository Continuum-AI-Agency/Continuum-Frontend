-- Phase 1 of brand & user management overhaul.
-- Adds explicit connection-level brand access for integrations.
-- See: .claude/plans/we-need-to-look-shiny-clarke.md (Decision D1, Phase 1).
--
-- Idempotent: safe to re-run. Backfill uses ON CONFLICT DO NOTHING.

create table if not exists brand_profiles.brand_integration_grants (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  integration_id uuid not null references brand_profiles.user_integrations(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Active-grant uniqueness — supports the ON CONFLICT clause in the backfill.
create unique index if not exists brand_integration_grants_active_unique
  on brand_profiles.brand_integration_grants (brand_profile_id, integration_id)
  where revoked_at is null;

-- FK indexes (per supabase-postgres-best-practices schema-foreign-key-indexes).
create index if not exists brand_integration_grants_integration_id_idx
  on brand_profiles.brand_integration_grants (integration_id);

create index if not exists brand_integration_grants_brand_profile_id_idx
  on brand_profiles.brand_integration_grants (brand_profile_id);

-- Phase 5 cascade: removeMemberAction soft-revokes grants where granted_by = removed_user.
create index if not exists brand_integration_grants_granted_by_active_idx
  on brand_profiles.brand_integration_grants (granted_by)
  where revoked_at is null;

-- updated_at trigger, mirroring brand_profiles.permissions touch trigger.
create or replace function brand_profiles.touch_brand_integration_grants_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brand_integration_grants_touch_updated_at
  on brand_profiles.brand_integration_grants;
create trigger brand_integration_grants_touch_updated_at
  before update on brand_profiles.brand_integration_grants
  for each row execute function brand_profiles.touch_brand_integration_grants_updated_at();

-- Grants. RLS layers on top of these; without them, every RLS-permitted query
-- still fails with "permission denied for relation."
revoke all on brand_profiles.brand_integration_grants from public;
grant select on brand_profiles.brand_integration_grants to authenticated;
grant insert on brand_profiles.brand_integration_grants to authenticated;
-- Column-scoped UPDATE: only the soft-revoke fields are mutable post-create.
grant update (revoked_at, revoked_by) on brand_profiles.brand_integration_grants to authenticated;

alter table brand_profiles.brand_integration_grants enable row level security;

-- Read: any brand member can see what's granted to their brand.
-- auth.uid() wrapped in subselect per RLS performance guidance.
drop policy if exists "brand_integration_grants read for brand members"
  on brand_profiles.brand_integration_grants;
create policy "brand_integration_grants read for brand members"
  on brand_profiles.brand_integration_grants
  for select
  to authenticated
  using (
    exists (
      select 1 from brand_profiles.permissions p
      where p.user_id = (select auth.uid())
        and p.brand_profile_id = brand_integration_grants.brand_profile_id
    )
  );

-- Insert: only owner|admin of the brand AND caller owns the integration AND
-- granted_by is the caller. Prevents privilege escalation by claiming foreign integrations.
drop policy if exists "brand_integration_grants insert for owner/admin granters"
  on brand_profiles.brand_integration_grants;
create policy "brand_integration_grants insert for owner/admin granters"
  on brand_profiles.brand_integration_grants
  for insert
  to authenticated
  with check (
    granted_by = (select auth.uid())
    and exists (
      select 1 from brand_profiles.permissions p
      where p.user_id = (select auth.uid())
        and p.brand_profile_id = brand_integration_grants.brand_profile_id
        and p.role in ('owner', 'admin')
    )
    and exists (
      select 1 from brand_profiles.user_integrations ui
      where ui.id = brand_integration_grants.integration_id
        and ui.user_id = (select auth.uid())
    )
  );

-- Update: only the granter or brand owner can revoke. Combined with the
-- column-scoped GRANT above, only revoked_at/revoked_by are mutable.
drop policy if exists "brand_integration_grants revoke for granter or owner"
  on brand_profiles.brand_integration_grants;
create policy "brand_integration_grants revoke for granter or owner"
  on brand_profiles.brand_integration_grants
  for update
  to authenticated
  using (
    granted_by = (select auth.uid())
    or exists (
      select 1 from brand_profiles.permissions p
      where p.user_id = (select auth.uid())
        and p.brand_profile_id = brand_integration_grants.brand_profile_id
        and p.role = 'owner'
    )
  )
  with check (
    granted_by = (select auth.uid())
    or exists (
      select 1 from brand_profiles.permissions p
      where p.user_id = (select auth.uid())
        and p.brand_profile_id = brand_integration_grants.brand_profile_id
        and p.role = 'owner'
    )
  );

-- Backfill: every distinct (brand_profile_id, integration_id) pair already linked
-- via brand_profile_integration_accounts becomes an active grant, with the
-- integration owner recorded as the granter.
--
-- COALESCE on bpia.integration_id falls back to the asset's integration_id
-- when bpia.integration_id is NULL. Audit on 2026-05-01 found 3 such BPIA rows
-- in test brands; the fallback ensures they aren't silently dropped from the
-- grants table (which would then hide them from the tightened summary RPC).
insert into brand_profiles.brand_integration_grants
  (brand_profile_id, integration_id, granted_by, granted_at)
select distinct
  bpia.brand_profile_id,
  coalesce(bpia.integration_id, iaa.integration_id) as integration_id,
  ui.user_id as granted_by,
  coalesce(bpia.created_at, now()) as granted_at
from brand_profiles.brand_profile_integration_accounts bpia
join brand_profiles.integration_accounts_assets iaa on iaa.id = bpia.integration_account_id
join brand_profiles.user_integrations ui
  on ui.id = coalesce(bpia.integration_id, iaa.integration_id)
where coalesce(bpia.integration_id, iaa.integration_id) is not null
on conflict (brand_profile_id, integration_id) where revoked_at is null do nothing;

-- Backfill verification — fail the migration loudly if BPIA rows were missed.
do $$
declare
  bpia_count integer;
  grants_count integer;
begin
  select count(distinct (bpia.brand_profile_id, coalesce(bpia.integration_id, iaa.integration_id)))
    into bpia_count
    from brand_profiles.brand_profile_integration_accounts bpia
    join brand_profiles.integration_accounts_assets iaa on iaa.id = bpia.integration_account_id
    join brand_profiles.user_integrations ui
      on ui.id = coalesce(bpia.integration_id, iaa.integration_id)
    where coalesce(bpia.integration_id, iaa.integration_id) is not null;

  select count(*)
    into grants_count
    from brand_profiles.brand_integration_grants
    where revoked_at is null;

  if grants_count < bpia_count then
    raise exception
      'brand_integration_grants backfill incomplete: bpia=% grants=%',
      bpia_count, grants_count;
  end if;
end$$;
