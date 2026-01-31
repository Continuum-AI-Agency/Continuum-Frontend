-- Create chat_messages table
create table if not exists brand_profiles.chat_messages (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  user_avatar text,
  room_id text not null default 'main',
  content text not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_chat_messages_brand_profile_id on brand_profiles.chat_messages(brand_profile_id);
create index if not exists idx_chat_messages_room_id on brand_profiles.chat_messages(room_id);
create index if not exists idx_chat_messages_created_at on brand_profiles.chat_messages(created_at);

-- RLS
alter table brand_profiles.chat_messages enable row level security;

create policy "View messages (member)" on brand_profiles.chat_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from brand_profiles.permissions p
      where p.brand_profile_id = brand_profiles.chat_messages.brand_profile_id
      and p.user_id = auth.uid()
    )
    or exists (
      select 1 from brand_profiles.brand_profiles bp
      where bp.id = brand_profiles.chat_messages.brand_profile_id
      and bp.created_by = auth.uid()
    )
  );

drop policy if exists "Insert messages (member)" on brand_profiles.chat_messages;
create policy "Insert messages (member)" on brand_profiles.chat_messages
  for insert
  to authenticated
  with check (
    (
      exists (
        select 1 from brand_profiles.permissions p
        where p.brand_profile_id = brand_profiles.chat_messages.brand_profile_id
        and p.user_id = auth.uid()
      )
      or exists (
        select 1 from brand_profiles.brand_profiles bp
        where bp.id = brand_profiles.chat_messages.brand_profile_id
        and bp.created_by = auth.uid()
      )
    )
    and user_id = auth.uid()
  );

create policy "Insert messages (member)" on brand_profiles.chat_messages
  for insert
  to authenticated
  with check (
    exists (
      select 1 from brand_profiles.permissions p
      where p.brand_profile_id = brand_profiles.chat_messages.brand_profile_id
      and p.user_id = auth.uid()
    )
    and user_id = auth.uid()
  );

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and schemaname = 'brand_profiles' 
    and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table brand_profiles.chat_messages;
  end if;
end $$;

-- Grants
grant usage on schema brand_profiles to authenticated;
grant all on brand_profiles.chat_messages to authenticated;
grant all on brand_profiles.chat_messages to service_role;

-- TTL Cleanup Function
create or replace function brand_profiles.cleanup_old_chat_messages()
returns void
language plpgsql
security definer
as $$
begin
  delete from brand_profiles.chat_messages
  where created_at < (now() - interval '24 hours');
end;
$$;

-- Schedule cleanup (requires pg_cron)
-- select cron.schedule('cleanup-old-chat-messages', '0 * * * *', $$select brand_profiles.cleanup_old_chat_messages()$$);
