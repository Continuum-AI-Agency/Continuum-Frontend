create table if not exists brand_profiles.user_brand_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_brand_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists user_brand_preferences_active_brand_idx
  on brand_profiles.user_brand_preferences (active_brand_id);

create or replace function brand_profiles.has_brand_access(brand_id uuid)
returns boolean
language sql
stable
security invoker
as $$
  select exists (
    select 1
    from brand_profiles.permissions p
    where p.user_id = auth.uid()
      and p.brand_profile_id = brand_id
  );
$$;

grant execute on function brand_profiles.has_brand_access(uuid) to authenticated;

alter table brand_profiles.user_brand_preferences enable row level security;

grant select, insert, update, delete on brand_profiles.user_brand_preferences to authenticated;

drop policy if exists "User can read own brand preference" on brand_profiles.user_brand_preferences;
create policy "User can read own brand preference"
  on brand_profiles.user_brand_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "User can insert own brand preference" on brand_profiles.user_brand_preferences;
create policy "User can insert own brand preference"
  on brand_profiles.user_brand_preferences
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and brand_profiles.has_brand_access(active_brand_id)
  );

drop policy if exists "User can update own brand preference" on brand_profiles.user_brand_preferences;
create policy "User can update own brand preference"
  on brand_profiles.user_brand_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and brand_profiles.has_brand_access(active_brand_id)
  );

drop policy if exists "User can delete own brand preference" on brand_profiles.user_brand_preferences;
create policy "User can delete own brand preference"
  on brand_profiles.user_brand_preferences
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function brand_profiles.touch_user_brand_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists user_brand_preferences_touch_updated_at on brand_profiles.user_brand_preferences;
create trigger user_brand_preferences_touch_updated_at
before update on brand_profiles.user_brand_preferences
for each row execute function brand_profiles.touch_user_brand_preferences_updated_at();

insert into brand_profiles.user_brand_preferences (user_id, active_brand_id, created_at, updated_at)
select u.user_id, u.brand_id, timezone('utc'::text, now()), timezone('utc'::text, now())
from brand_profiles.user_onboarding_states u
where u.is_active = true
  and exists (
    select 1
    from brand_profiles.permissions p
    where p.user_id = u.user_id
      and p.brand_profile_id = u.brand_id
  )
on conflict (user_id) do update
set active_brand_id = excluded.active_brand_id,
    updated_at = timezone('utc'::text, now());

create or replace function brand_profiles.get_active_brand_id()
returns uuid
language sql
stable
as $$
  with preferred as (
    select pref.active_brand_id
    from brand_profiles.user_brand_preferences pref
    where pref.user_id = auth.uid()
      and exists (
        select 1
        from brand_profiles.permissions p
        where p.user_id = auth.uid()
          and p.brand_profile_id = pref.active_brand_id
      )
    limit 1
  ),
  fallback as (
    select p.brand_profile_id
    from brand_profiles.permissions p
    where p.user_id = auth.uid()
    order by
      case p.role
        when 'owner' then 0
        when 'admin' then 1
        when 'operator' then 2
        else 3
      end,
      p.created_at asc
    limit 1
  )
  select coalesce(
    (select active_brand_id from preferred),
    (select brand_profile_id from fallback)
  );
$$;

grant execute on function brand_profiles.get_active_brand_id() to authenticated;
