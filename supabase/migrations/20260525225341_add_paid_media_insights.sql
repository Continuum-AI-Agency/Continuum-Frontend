-- Paid media campaign insights: persistent history of client- and server-generated
-- performance insights so agents (Jaina, future automations) can read them and so we
-- have a durable log of flagged campaign problems.
--
-- Two tables:
--   paid_media_insight_snapshots  — one row per compute (range, peer-set size, source).
--   paid_media_campaign_insights  — one row per GeneratedCampaignInsight, FK to a snapshot.

create table if not exists brand_profiles.paid_media_insight_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  ad_account_id text not null,
  platform text not null default 'meta',
  range_preset text not null,
  range_since date,
  range_until date,
  peer_set_size int not null,
  insight_count int not null,
  computed_at timestamptz not null default timezone('utc'::text, now()),
  computed_by uuid references auth.users(id) on delete set null,
  source text not null default 'client',
  constraint paid_media_insight_snapshots_source_chk
    check (source in ('client', 'server', 'agent'))
);

create table if not exists brand_profiles.paid_media_campaign_insights (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null
    references brand_profiles.paid_media_insight_snapshots(id) on delete cascade,
  brand_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  ad_account_id text not null,
  campaign_id text,
  campaign_name text,
  scope text not null,
  severity text not null,
  status text not null,
  primary_metric text not null,
  title text not null,
  summary text not null,
  recommendation text,
  source text not null,
  evidence jsonb not null,
  fingerprint text generated always as (
    coalesce(campaign_id, 'account') || ':' || primary_metric || ':' || status
  ) stored,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint paid_media_campaign_insights_scope_chk
    check (scope in ('account', 'campaign', 'index')),
  constraint paid_media_campaign_insights_severity_chk
    check (severity in ('info', 'opportunity', 'warning', 'critical')),
  constraint paid_media_campaign_insights_status_chk
    check (status in ('strong', 'watch', 'risk', 'unknown'))
);

create index if not exists paid_media_insight_snapshots_brand_account_computed_idx
  on brand_profiles.paid_media_insight_snapshots (brand_id, ad_account_id, computed_at desc);

create index if not exists paid_media_campaign_insights_brand_account_created_idx
  on brand_profiles.paid_media_campaign_insights (brand_id, ad_account_id, created_at desc);

create index if not exists paid_media_campaign_insights_brand_campaign_fp_idx
  on brand_profiles.paid_media_campaign_insights (brand_id, campaign_id, fingerprint, created_at desc)
  where campaign_id is not null;

create index if not exists paid_media_campaign_insights_snapshot_idx
  on brand_profiles.paid_media_campaign_insights (snapshot_id);

create index if not exists paid_media_campaign_insights_active_risks_idx
  on brand_profiles.paid_media_campaign_insights (brand_id, ad_account_id, created_at desc)
  where severity in ('critical', 'warning') and status = 'risk';

alter table brand_profiles.paid_media_insight_snapshots enable row level security;
alter table brand_profiles.paid_media_campaign_insights enable row level security;

drop policy if exists "Manage paid media insight snapshots (member)"
  on brand_profiles.paid_media_insight_snapshots;
create policy "Manage paid media insight snapshots (member)"
  on brand_profiles.paid_media_insight_snapshots
  for all
  to authenticated
  using (brand_profiles.has_brand_access(brand_id))
  with check (brand_profiles.has_brand_access(brand_id));

drop policy if exists "Manage paid media campaign insights (member)"
  on brand_profiles.paid_media_campaign_insights;
create policy "Manage paid media campaign insights (member)"
  on brand_profiles.paid_media_campaign_insights
  for all
  to authenticated
  using (brand_profiles.has_brand_access(brand_id))
  with check (brand_profiles.has_brand_access(brand_id));

grant all on table brand_profiles.paid_media_insight_snapshots
  to authenticated, service_role, anon;
grant all on table brand_profiles.paid_media_campaign_insights
  to authenticated, service_role, anon;
grant usage on schema brand_profiles to authenticated, service_role, anon;

-- Latest snapshot's insights for a brand+ad-account, sorted by severity.
-- security invoker (default for sql functions) so RLS applies to authenticated callers;
-- service_role bypasses RLS for agents-ts.
create or replace function brand_profiles.get_latest_paid_media_insights(
  p_brand_id uuid,
  p_ad_account_id text,
  p_limit int default 20
)
returns setof brand_profiles.paid_media_campaign_insights
language sql
stable
set search_path = brand_profiles, public
as $$
  select i.*
  from brand_profiles.paid_media_campaign_insights i
  where i.brand_id = p_brand_id
    and i.ad_account_id = p_ad_account_id
    and i.snapshot_id = (
      select s.id
      from brand_profiles.paid_media_insight_snapshots s
      where s.brand_id = p_brand_id
        and s.ad_account_id = p_ad_account_id
      order by s.computed_at desc
      limit 1
    )
  order by
    case i.severity
      when 'critical' then 0
      when 'warning' then 1
      when 'opportunity' then 2
      else 3
    end,
    i.created_at desc
  limit p_limit;
$$;

-- Count of distinct days a given fingerprint has appeared within a lookback window.
-- Lets agents say "CPA on Campaign X has been flagged 4 of the last 7 days."
create or replace function brand_profiles.get_paid_media_insight_streak(
  p_brand_id uuid,
  p_ad_account_id text,
  p_fingerprint text,
  p_lookback_days int default 14
)
returns int
language sql
stable
set search_path = brand_profiles, public
as $$
  select count(distinct date_trunc('day', created_at))::int
  from brand_profiles.paid_media_campaign_insights
  where brand_id = p_brand_id
    and ad_account_id = p_ad_account_id
    and fingerprint = p_fingerprint
    and created_at >= timezone('utc'::text, now()) - (p_lookback_days || ' days')::interval;
$$;

revoke all on function
  brand_profiles.get_latest_paid_media_insights(uuid, text, int) from public;
revoke all on function
  brand_profiles.get_paid_media_insight_streak(uuid, text, text, int) from public;

grant execute on function
  brand_profiles.get_latest_paid_media_insights(uuid, text, int)
  to authenticated, service_role;
grant execute on function
  brand_profiles.get_paid_media_insight_streak(uuid, text, text, int)
  to authenticated, service_role;
