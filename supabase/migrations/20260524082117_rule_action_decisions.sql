-- Continuum-side audit mirror of every approve / reject / failure for rule actions
-- handled through the rule-actions edge function. The dco backend keeps its own
-- rule_action_logs table; this one lives in our DB so a future "decision history"
-- view doesn't require cross-team schema coordination.

create table if not exists public.rule_action_decisions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  rule_action_id text not null,
  decision text not null check (decision in ('APPROVED', 'REJECTED', 'FAILED')),
  action_type text not null,
  scope_type text,
  scope_id text,
  actor_id text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  note text,
  reason text,
  error text,
  is_dry_run boolean not null default false,
  upstream_result jsonb,
  decided_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists rule_action_decisions_brand_decided_at_idx
  on public.rule_action_decisions (brand_id, decided_at desc);

create index if not exists rule_action_decisions_rule_action_id_idx
  on public.rule_action_decisions (rule_action_id);

alter table public.rule_action_decisions enable row level security;

-- Select: any user with a permissions row on the brand can read its decisions.
create policy rule_action_decisions_select_via_brand_permission
  on public.rule_action_decisions
  for select
  to authenticated
  using (
    exists (
      select 1
      from brand_profiles.permissions p
      where p.brand_profile_id = rule_action_decisions.brand_id
        and p.user_id = auth.uid()
    )
  );

-- Inserts are service-role only. No policy is created for `insert` to
-- authenticated users; the edge function uses the service-role client.

comment on table public.rule_action_decisions is
  'Audit mirror of approve / reject / failure decisions made through the rule-actions edge function. Insert is service-role only; select is gated by brand permissions.';
