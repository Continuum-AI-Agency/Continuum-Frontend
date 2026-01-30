-- Create canvas_sessions table for real-time collaboration
create table if not exists brand_profiles.canvas_sessions (
  brand_profile_id uuid primary key references brand_profiles.brand_profiles(id) on delete cascade,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- Index for faster lookups
create index if not exists idx_canvas_sessions_brand_profile_id
  on brand_profiles.canvas_sessions (brand_profile_id);

-- Index for TTL cleanup
create index if not exists idx_canvas_sessions_updated_at
  on brand_profiles.canvas_sessions (updated_at);

-- Grant permissions
grant select, insert, update, delete
  on brand_profiles.canvas_sessions
  to authenticated;

-- Enable RLS
alter table brand_profiles.canvas_sessions enable row level security;

-- Policy: Users can manage sessions for brands they have access to
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'canvas_sessions'
      and policyname = 'Manage canvas sessions (member)'
  ) then
    create policy "Manage canvas sessions (member)"
      on brand_profiles.canvas_sessions
      for all
      to authenticated
      using (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = brand_profiles.canvas_sessions.brand_profile_id
            and p.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = brand_profiles.canvas_sessions.brand_profile_id
            and p.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Function to cleanup old canvas sessions (sessions not updated in 24 hours)
create or replace function brand_profiles.cleanup_old_canvas_sessions()
returns void
language plpgsql
security definer
as $$
begin
  delete from brand_profiles.canvas_sessions
  where updated_at < (now() - interval '24 hours');
end;
$$;

-- Schedule cleanup to run daily (requires pg_cron extension)
-- Note: This will only work if pg_cron is enabled on your Supabase project
-- Uncomment the following if you have pg_cron:
-- select cron.schedule(
--   'cleanup-old-canvas-sessions',
--   '0 0 * * *', -- Run daily at midnight
--   $$select brand_profiles.cleanup_old_canvas_sessions()$$
-- );
