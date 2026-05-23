-- Grant access to the organic schema for authenticated users.
-- Without USAGE + explicit table grants, every query returns "permission denied"
-- regardless of RLS policies.

grant usage on schema organic to anon, authenticated;

-- organic_published_posts -------------------------------------------------------

revoke all on organic.organic_published_posts from public;
grant select on organic.organic_published_posts to authenticated;

alter table organic.organic_published_posts enable row level security;

drop policy if exists "organic_published_posts select for brand members"
  on organic.organic_published_posts;
create policy "organic_published_posts select for brand members"
  on organic.organic_published_posts
  for select
  to authenticated
  using (
    exists (
      select 1 from brand_profiles.permissions p
      where p.user_id = (select auth.uid())
        and p.brand_profile_id = organic_published_posts.brand_id
    )
  );

-- organic_calendar_drafts -------------------------------------------------------
-- Drafts need read + write for the planner; insert/update/delete are scoped to
-- the draft owner via user_id.

revoke all on organic.organic_calendar_drafts from public;
grant select, insert, update, delete on organic.organic_calendar_drafts to authenticated;

alter table organic.organic_calendar_drafts enable row level security;

drop policy if exists "organic_calendar_drafts select for brand members"
  on organic.organic_calendar_drafts;
create policy "organic_calendar_drafts select for brand members"
  on organic.organic_calendar_drafts
  for select
  to authenticated
  using (
    exists (
      select 1 from brand_profiles.permissions p
      where p.user_id = (select auth.uid())
        and p.brand_profile_id = organic_calendar_drafts.brand_id
    )
  );

drop policy if exists "organic_calendar_drafts write for draft owner"
  on organic.organic_calendar_drafts;
create policy "organic_calendar_drafts write for draft owner"
  on organic.organic_calendar_drafts
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
