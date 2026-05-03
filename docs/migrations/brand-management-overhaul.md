# Brand & User Management — Migration Plan

This document tracks every SQL migration required for the brand and user management overhaul. Each entry lists what the migration does, why it is needed, dependency order, and what to verify before applying.

The implementation plan that drives these migrations lives at `.claude/plans/we-need-to-look-shiny-clarke.md`. The user-facing motivation is Michelle's Privalia demo failure where invited teammates could not see Meta/Instagram permissions because OAuth tokens were user-scoped, not brand-scoped.

## Apply order

Run migrations in the order listed. Each section identifies the file path under `supabase/migrations/`.

| # | File | Purpose | Status |
|---|------|---------|--------|
| 1 | `20260430140000_add_brand_integration_grants.sql` | Connection-level brand access table + backfill | Ready (COALESCE fix applied) |
| 2 | `20260430140100_add_brand_token_rpcs.sql` | Token + list RPCs (decrypted, role-gated) | Ready |
| 3 | `20260430140200_get_brand_integration_summary_requires_grant.sql` | Existing RPC tightened to require active grant | Ready |
| 4 | `20260430140300_add_brand_grant_action_rpcs.sql` | grant/revoke action RPCs for atomic server-side writes | Ready |
| 5 | `20260430140400_add_acknowledged_at_to_permissions.sql` | "Recently accepted" badge support | Ready |
| 6 | `20260430140500_normalize_invite_email_lowercase.sql` | One-shot lowercase normalization + CHECK constraint | Ready (audit confirms 0 affected rows) |
| 7 | `20260430140600_bpia_auto_grant_trigger.sql` | Auto-create grant on BPIA insert + repeat backfill | Ready (COALESCE fix applied) |
| 8 | `20260430140700_list_my_connection_grants_rpc.sql` | RPC backing the settings/integrations grant pills | Ready |
| — | (no migration) `change_role` lives in the `brand_invite` edge function (`supabase/functions/brand_invite/index.ts`); deploy that alongside the SQL changes | Code-only |

---

## 1. `20260430140000_add_brand_integration_grants.sql`

**What it does**
- Creates `brand_profiles.brand_integration_grants` table tracking which OAuth connection (`user_integrations.id`) is granted to which brand, by whom, and when.
- Columns: `id`, `brand_profile_id`, `integration_id`, `granted_by`, `granted_at`, `revoked_at`, `revoked_by`, `updated_at`.
- Adds unique partial index `(brand_profile_id, integration_id) WHERE revoked_at IS NULL` enforcing one active grant per (brand, connection).
- Adds FK indexes on `integration_id`, `brand_profile_id`, and a partial index on `granted_by` for the Phase 5 removeMember cascade.
- Adds an `updated_at` trigger mirroring `permissions_touch_updated_at`.
- Grants `SELECT, INSERT` to `authenticated`; grants `UPDATE (revoked_at, revoked_by)` only — column-scoped so callers cannot rewrite `brand_profile_id` or `integration_id` post-create.
- Enables RLS with three policies:
  - **read**: any brand member with a `permissions` row may read grants for their brand.
  - **insert**: only owner|admin of the brand AND caller must own the integration AND `granted_by = auth.uid()`. Prevents privilege escalation by claiming foreign integrations.
  - **update**: only the granter or brand owner. Combined with the column-scoped GRANT, only soft-revoke columns are mutable.
- All `auth.uid()` references wrapped in `(select auth.uid())` per Supabase RLS performance guidance.
- **Backfill**: every distinct `(brand_profile_id, integration_id)` already present in `brand_profile_integration_accounts` becomes an active grant with `granted_by` set to the integration owner. `ON CONFLICT DO NOTHING` makes this idempotent.
- **Verification block**: raises an exception at the end of the migration if backfill row count is less than the BPIA distinct count — fails the migration loudly rather than silently regressing UI visibility.

**Why it's needed.** The single highest-impact root cause of Michelle's bug. Today, OAuth tokens live in `user_integrations` keyed by `user_id` and an RLS of `auth.uid() = user_id`. A teammate invited to Privalia has a `permissions` row but no path to read tokens connected by another user. This table introduces explicit connection-level brand access.

**Verification before applying.**
- Postgres version ≥ 15 (required for `ON CONFLICT (cols) WHERE …` against a partial unique index). Supabase default satisfies this.
- `brand_profiles.brand_profile_integration_accounts` has columns `brand_profile_id`, `integration_id`, `created_at`. Confirm with `\d brand_profiles.brand_profile_integration_accounts`.
- `brand_profiles.user_integrations.user_id` exists and is NOT NULL.
- BPIA row count is bounded — backfill runs inside the migration transaction. If BPIA has > 100k rows, set a `statement_timeout` before running.

**Reversal.** Drop policies, drop trigger and function, drop table — all listed in commented "Down" hints at the bottom of the file. Backfill data is lost on drop; not reversible without a snapshot.

---

## 2. `20260430140100_add_brand_token_rpcs.sql`

**What it does**
- Creates `brand_profiles.list_brand_integrations(p_brand_profile_id)` — `STABLE SECURITY DEFINER`, returns `(integration_id, provider, granted_by, granted_at)` for any brand member (including viewer). `ORDER BY granted_at DESC`.
- Creates `brand_profiles.get_brand_integration_token(p_brand_profile_id, p_provider)` — `SECURITY DEFINER`. Returns the **decrypted** access token (`text`) when:
  1. caller has a `permissions` row for the brand AND
  2. caller's role is `owner|admin|operator` (viewer cannot mint tokens) AND
  3. an active grant exists for the integration on that brand.
  Returns `NULL` otherwise. Uses `ORDER BY g.granted_at DESC LIMIT 1` for determinism when multiple integrations of the same provider are granted.
- Decryption reuses the existing `brand_profiles.decrypt_token(bytea) → text` helper (same pattern as `get_google_access_token` from `20260206_create_get_google_access_token_rpc.sql`).
- `search_path = brand_profiles, auth, extensions` (extensions kept in case `decrypt_token` invokes `pgcrypto`/`pgsodium` transitively). `public` deliberately dropped.
- Both functions: `REVOKE ALL FROM public; GRANT EXECUTE TO authenticated`.

**Why it's needed.** Token reads in a brand context must not require the caller to own the underlying `user_integrations` row. The RPC is the only code path that should decrypt tokens for brand operations.

**Verification before applying.**
- `brand_profiles.decrypt_token(bytea) → text` exists. Confirm with `\df brand_profiles.decrypt_token`.
- `user_integrations.access_token_encrypted` is `bytea` (not `text`). Confirm with `\d brand_profiles.user_integrations`.
- `auth.users` is reachable from the function (Supabase default).

**Audit logging is deferred.** Token retrieval is sensitive but the volume is small enough today that audit logging is a future concern. When added, follow up with a `brand_integration_token_audits` table and a `RAISE NOTICE` style insert from inside the function.

---

## 3. `20260430140200_get_brand_integration_summary_requires_grant.sql`

**What it does**
- Replaces `brand_profiles.get_brand_integration_summary(uuid)` to require an active grant for the underlying integration. Adds an INNER JOIN to `brand_integration_grants` filtering on `revoked_at IS NULL`.
- Preserves the original RPC signature byte-for-byte: same column names, same column order, same `RETURNS TABLE` types, same `LANGUAGE sql STABLE`, same `ORDER BY`, same TYPE_TO_PLATFORM_MAP `CASE` block. The full file is a near-verbatim copy of `20260329_add_integration_summary_rpcs.sql` with two surgical changes: the new JOIN and `auth.uid()` wrapped in `(select …)`.

**Why it's needed.** Without this change, `fetchBrandIntegrationSummary` would continue surfacing assignments for connections that have never been granted to a brand — the table-level grant table would be unused.

**Verification before applying.**
- The original RPC signature in `20260329_add_integration_summary_rpcs.sql` matches the file you applied to prod. CREATE OR REPLACE rejects any return-type drift.
- BPIA backfill from migration #1 has completed (every BPIA row has a matching active grant). Migration #1's verification block guarantees this.
- Post-deploy, every grant action must write the grant row in the same atomic operation as any BPIA mutation it implies (see migration #4 below).

**Operational note.** This INNER JOIN means: in the small window between a BPIA insert and a grant insert, the BPIA rows are invisible to the UI. The Phase 2 grant action is required to make these two writes atomic.

---

## 4. `2026XXXXXXXX_add_brand_grant_action_rpcs.sql` (pending — Phase 2)

**What it does**
- Creates `brand_profiles.grant_integration_to_brand(p_brand_profile_id, p_integration_id)` — `SECURITY DEFINER`. Validates: caller has `permissions.role IN ('owner','admin')` for brand AND caller owns the integration. Inserts a row into `brand_integration_grants` with `granted_by = auth.uid()`. Returns the new `grant_id`. `ON CONFLICT (brand_profile_id, integration_id) WHERE revoked_at IS NULL DO NOTHING` for idempotency.
- Creates `brand_profiles.revoke_integration_from_brand(p_grant_id)` — `SECURITY DEFINER`. Validates: caller is `granted_by` OR brand `owner`. Sets `revoked_at = now()` and `revoked_by = auth.uid()`. Returns void.
- Both: `REVOKE ALL FROM public; GRANT EXECUTE TO authenticated`.
- All `auth.uid()` references wrapped in `(select auth.uid())`.

**Why it's needed.** Frontend code calls a single RPC instead of issuing a raw INSERT — keeps validation server-side and makes future audit logging a one-line addition. Also makes the action a single statement, naturally atomic.

**Verification before applying.**
- Migration #1 has been applied (depends on `brand_integration_grants` table).
- Idempotency: re-calling `grant_integration_to_brand` for an already-granted pair must return the existing grant id without raising.

---

## 5. `2026XXXXXXXX_add_acknowledged_at_to_permissions.sql` (pending — Phase 5)

**What it does**
- Adds `acknowledged_at timestamptz NULL` column to `brand_profiles.permissions`.
- No backfill needed; existing rows have `acknowledged_at IS NULL` which is correct.

**Why it's needed.** Drives the "New" badge in the members table for 24h after invite acceptance. Phase 5 UI sets `acknowledged_at = now()` the first time the joining user opens the members section.

**Verification before applying.** None — additive nullable column.

---

## 6. `2026XXXXXXXX_add_change_role_action_to_brand_invite_fn.sql` (pending — Phase 5)

**What it does**
- May be unnecessary as a SQL migration — the `change_role` support is added inside the `brand_invite` edge function (`supabase/functions/brand_invite/index.ts`), not as a SQL change. Listed here only for tracking.
- If RLS adjustments are needed on `permissions` to allow role updates by owners/admins of the same brand, add them here. Today's RLS only allows users to manage their own row; an owner cannot directly update another user's permissions row without going through a SECURITY DEFINER edge function.

**Why it's needed.** Phase 5 surfaces a "Change role" affordance in the members menu.

**Verification before applying.** Confirm whether the edge function uses service role to bypass RLS, in which case no SQL change is required.

---

## 7. `2026XXXXXXXX_normalize_invite_email_lowercase.sql` (pending — Phase 5)

**What it does**
- One-shot `UPDATE brand_profiles.invites SET email = lower(email) WHERE email != lower(email)`.
- One-shot `UPDATE brand_profiles.permissions SET email = lower(email) WHERE email IS NOT NULL AND email != lower(email)`.
- Adds CHECK constraints `email = lower(email)` to both tables to prevent regression.

**Why it's needed.** Email casing has been observed to cause invites to look "pending" forever when the invited user signs up with different casing than was sent. Phase 5 also normalizes at write time in the edge function and server actions; this migration locks in the invariant at the schema level.

**Verification before applying.** Run the SELECT counterpart first to count affected rows. If thousands, batch the UPDATE in a follow-up to avoid a long transaction.

---

## Cross-cutting operational notes

- **All migrations are additive and reversible.** Down scripts live in commented "Down" blocks. A full rollback requires migrations #2 and #3 to revert before #1 (function dependencies on the grants table).
- **No long-lived feature flags.** Each migration is independently shippable and the corresponding application code uses the new schema once present.
- **Type regeneration.** After applying #1–#3, run `bun run supabase:gen:types` to refresh `src/lib/supabase/types.ts`.
- **Audit logging for token RPCs is deferred.** When added, follow up with a `brand_integration_token_audits` table and `RAISE NOTICE`-style instrumentation inside `get_brand_integration_token`.
