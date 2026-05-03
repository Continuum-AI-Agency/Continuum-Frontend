# Brand & User Management — Migration Apply Runbook

Use this runbook when applying the eight-migration brand & user management overhaul to production.

Plan: `.claude/plans/we-need-to-look-shiny-clarke.md` (Phase 11).
Migration spec: `docs/migrations/brand-management-overhaul.md`.

## Prerequisites

- Supabase MCP access (or service-role psql) to production.
- The frontend has already deployed Phases 1–10 code (grant UI, switcher hook, brand-scoped storage, members section, welcome banner). Verify by spot-checking `src/lib/integrations/grants.ts` and `src/hooks/useSwitchBrand.ts` exist on `main`.
- Off-hours window confirmed. Migrations 1, 6, 7 do real DML; the rest are DDL-only.
- COALESCE fix has already been applied to migrations #1 and #7 in source. Verify with `grep -n "coalesce(bpia.integration_id, iaa.integration_id)" supabase/migrations/20260430140000_add_brand_integration_grants.sql` and `grep -n "coalesce(new.integration_id, iaa.integration_id)" supabase/migrations/20260430140600_bpia_auto_grant_trigger.sql`.

## Pre-apply baseline (record these)

```sql
select count(*) as bpia_rows from brand_profiles.brand_profile_integration_accounts;
-- expect 61 (audit 2026-05-01)

select count(distinct brand_profile_id) as brands_with_bpia from brand_profiles.brand_profile_integration_accounts;
-- expect 23

select to_regclass('brand_profiles.brand_integration_grants') is null as table_does_not_exist_yet;
-- expect true

select count(*) as bpia_with_null_integration_id
from brand_profiles.brand_profile_integration_accounts
where integration_id is null;
-- expect 3 (all in test brands; the COALESCE fix backfills them via integration_accounts_assets)
```

## Apply order

Run each migration sequentially. Stop and triage if any migration raises.

| # | File | Type | Expected duration |
|---|------|------|-------------------|
| 1 | `20260430140000_add_brand_integration_grants.sql` | DDL + backfill + verification block | < 5s |
| 2 | `20260430140100_add_brand_token_rpcs.sql` | DDL | instant |
| 3 | `20260430140200_get_brand_integration_summary_requires_grant.sql` | DDL | instant |
| 4 | `20260430140300_add_brand_grant_action_rpcs.sql` | DDL | instant |
| 5 | `20260430140400_add_acknowledged_at_to_permissions.sql` | DDL | instant |
| 6 | `20260430140500_normalize_invite_email_lowercase.sql` | DDL + DML (no-op per audit) | instant |
| 7 | `20260430140600_bpia_auto_grant_trigger.sql` | DDL + repeat-backfill | < 5s |
| 8 | `20260430140700_list_my_connection_grants_rpc.sql` | DDL | instant |

If migration #1 raises `brand_integration_grants backfill incomplete: bpia=X grants=Y`, do not proceed. The COALESCE fix should prevent this; if it fires, run the gap query in the rollback section to find the offending BPIA rows.

## Post-apply verification

```sql
-- 1. Grants table populated
select count(*) as active_grants
from brand_profiles.brand_integration_grants
where revoked_at is null;
-- expect ~26 + however many distinct (brand, asset_integration_id) pairs the COALESCE captures
-- (= 26 if test-brand assets share integrations with existing BPIA; else slightly higher)

-- 2. Every BPIA brand has at least one grant
select count(distinct brand_profile_id) as brands_with_grants
from brand_profiles.brand_integration_grants
where revoked_at is null;
-- expect ≥ 23

-- 3. Privalia MX. canonical brand resolves correctly
select * from brand_profiles.list_brand_integrations(
  '923af852-ad6c-4ec4-aa11-94f25dafd00e'::uuid
);
-- expect 1 row for the Meta integration owned by rmantilla

-- 4. Trigger smoke test (run in a transaction, then rollback)
begin;
  insert into brand_profiles.brand_profile_integration_accounts (
    brand_profile_id,
    integration_account_id,
    integration_id,
    alias
  )
  select
    p.brand_profile_id,
    iaa.id,
    iaa.integration_id,
    'runbook smoke test'
  from brand_profiles.permissions p
  cross join brand_profiles.integration_accounts_assets iaa
  where p.user_id = (select id from auth.users where email = 'rmantilla@grupoaxo.com')
    and p.role = 'owner'
  limit 1;

  -- Confirm a grant row appeared
  select count(*)
  from brand_profiles.brand_integration_grants g
  where g.granted_at > now() - interval '1 minute';
rollback;

-- 5. RLS sanity — anonymous role sees nothing
set role anon;
select count(*) from brand_profiles.brand_integration_grants;
-- expect 0
reset role;
```

## Frontend follow-up

After all eight migrations land:

```bash
bun run supabase:gen:types
```

Check that the new RPCs appear in `src/lib/supabase/types.ts`:
- `list_brand_integrations`
- `get_brand_integration_token`
- `grant_integration_to_brand`
- `revoke_integration_from_brand`
- `list_my_connection_grants`

Drop the `as never` casts in `src/lib/integrations/grants.ts` once the generated types include them.

## Rollback

Migrations are additive and reversible. If `get_brand_integration_summary` starts returning empty for brands that previously had BPIA rows:

1. Re-apply the prior `get_brand_integration_summary` definition from `20260329_add_integration_summary_rpcs.sql` to undo migration #3. The grants table and RPCs from migrations #1, #2, #4, #7, #8 stay in place — they are write-on-demand and backwards-compatible.
2. Investigate the gap:

```sql
select
  bpia.brand_profile_id,
  bpia.integration_account_id,
  bpia.integration_id as bpia_integration_id,
  iaa.integration_id as asset_integration_id,
  ui.user_id as integration_owner
from brand_profiles.brand_profile_integration_accounts bpia
join brand_profiles.integration_accounts_assets iaa on iaa.id = bpia.integration_account_id
left join brand_profiles.user_integrations ui
  on ui.id = coalesce(bpia.integration_id, iaa.integration_id)
left join brand_profiles.brand_integration_grants g
  on g.brand_profile_id = bpia.brand_profile_id
  and g.integration_id = coalesce(bpia.integration_id, iaa.integration_id)
  and g.revoked_at is null
where g.id is null;
```

3. Re-run the COALESCE backfill from migration #1 to repair gaps (idempotent via the unique partial index).
4. Re-apply migration #3 once gaps close.

## Post-migration data ops (optional, see Phase 8 Section A)

These are coordinated manual ops with rmantilla and Michelle, **not** part of the migration apply itself:

1. Add Michelle to canonical Privalia (`923af852-…`) as `admin` via the Phase 5 invite UI.
2. Resolve three expired invites on `923af852-…` (`kpenar@grupoaxo.com`, `ktenar@grupoaxo.com`, `fllanosc@grupoaxo.com`).
3. Soft-delete empty duplicates `7f2d71d0-…` and `db980fd2-…`.
4. Decide with Michelle on `e2882b1a-…` (has Meta connection on personal email).
