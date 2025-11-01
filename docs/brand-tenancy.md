# Brand Profile Identity & Multi‑Tenant Data Plan

This document describes how Continuum models Brand Profiles, assigns stable
identifiers, and enforces multi-tenant isolation across Supabase auth, the
Onboarding experience, and application data routes.

---

## Goals
- Guarantee every authenticated user lands on a valid Brand Profile context.
- Allow one Supabase user to own or join multiple Brand Profiles.
- Keep tenant boundaries airtight: no cross-tenant reads or writes.
- Make Brand Profile IDs durable so downstream services (documents,
  integrations, analytics) can reference them.

---

## Identifier Strategy
1. **Canonical ID generator**  
   `createBrandId()` (`src/lib/onboarding/state.ts`) uses
   `crypto.randomUUID()` when available and falls back to a timestamp/random
   composite. This produces globally unique, non-sequential IDs that are safe to
   expose in URLs.

2. **Authoritative source of truth**  
   - During onboarding, IDs live in `auth.users.user_metadata.onboarding`, managed
     via `ensureOnboardingState()` and friends (`src/lib/onboarding/storage.ts`).
     This guarantees a Brand Profile shell exists before the first dashboard
     render.
   - After onboarding completion we persist the same ID into normalized tables
     (see “Relational Model”) so that multi-user access and historical records do
     not rely on mutable metadata blobs.

3. **Active Brand selection**  
   `setActiveBrand()` updates the user’s metadata with the currently selected
   Brand ID. Server layouts (`src/app/(post-auth)/layout.tsx`) read this value to
   decide which tenant context to boot. Client UX (e.g., brand switcher in
   `src/components/dashboard-header.tsx`) calls the same action, keeping
   navigation stateless and cache-friendly.

---

## Relational Model (Supabase Postgres)
Once a Brand Profile is ready for shared use, we mint rows in Postgres using the
metadata snapshot as the seed. Tables (names tentative):

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `brand_profiles` | `id` (PK), `owner_user_id`, `name`, `industry`, `timezone`, `created_at`, `completed_at` | Canonical brand record. Mirrors the onboarding brand fields. |
| `brand_members` | `brand_id`, `user_id`, `role`, `invited_by`, `joined_at` | Membership list. Owner is inserted automatically; additional members join via magic links. |
| `brand_invites` | `id`, `brand_id`, `email`, `role`, `token`, `expires_at`, `created_at` | Pending invitations created by `createMagicLinkInvite()`. |
| `brand_documents` | `id`, `brand_id`, `source`, `name`, `status`, `external_url`, `metadata` | Long-term storage for documents added during onboarding or later. |
| `brand_integrations` | `id`, `brand_id`, `provider`, `account_id`, `status`, `last_synced_at`, `settings` | Tracks downstream platform connections. |

All tables use a UUID `brand_id` column that matches the `createBrandId()`
output. Referential integrity is enforced with foreign keys.

---

## Multi-Tenant Enforcement
1. **Row Level Security (RLS)**  
   - Each table enables RLS.  
   - Policies reference Supabase’s `auth.uid()` and the `brand_members` table to
     ensure only members (matching `role` restrictions where necessary) can
     access rows for a given `brand_id`.

2. **Server access pattern**  
   - Every server action, route, or loader receives an `activeBrandId` argument
     (from metadata or URL).  
   - Before performing work, it fetches the `brand_members` row for
     `(brand_id, auth.uid())`. Absence triggers a 403 (or redirect to onboarding
     if the owner has not finished setup).  
   - Shared utilities live in `src/lib/server/*`, so access control logic stays
     consistent.

3. **Client isolation**  
   - Client components never hold raw Supabase clients. They call server actions
     that already enforce tenant checks.  
   - Cache keys and React Query scopes (if introduced) include `brandId` to avoid
     bleeding data between tenants.

---

## Lifecycle & Data Sync
1. **Login → Onboarding**  
   - `ensureOnboardingState()` creates an initial brand record in metadata if
     none exist. The user is redirected to `/onboarding?brand={brandId}` until
     `isOnboardingComplete(state)` returns true.

2. **Onboarding completion**  
   - A dedicated server action will materialize the metadata into the relational
     tables described above, wrapping the insertions in a transaction to keep
     tenant data consistent.  
   - After persistence succeeds the action stamps `completedAt` in both metadata
     and `brand_profiles.completed_at`.

3. **Runtime operations**  
   - Switching brands updates metadata and refreshes the dashboard.  
   - Invitations write to `brand_invites`; when the invitee accepts, we insert
     into `brand_members` and regenerate their onboarding metadata so the active
     brand is correctly set on the next login.  
   - Deleting a brand (future) will either soft-delete rows or mark them
     archived, keyed by the same ID.

---

## Migration Steps
1. **Backfill existing users**: Script that reads current metadata, inserts
   rows into the relational tables, and confirms parity.
2. **Introduce RLS policies**: Start in “log-only” mode to verify policy hits,
   then enforce.
3. **Refactor server actions**: Route all read/write operations through branded
   helpers that assert membership and return typed responses.
4. **Clean up metadata**: Keep lightweight onboarding hints in user metadata
   (active brand pointer, latest step), but move authoritative data to the
   tables.

---

## Open Questions
- How do we synchronize external integration tokens (e.g., Canva, Meta)?
  Decision: store encrypted tokens per `brand_id` in `brand_integrations`.
- Do we allow a user to belong to multiple tenants with different roles?
  Current model supports it; UX will need clear brand switching cues.
- How do we handle billing? Add a `brand_subscriptions` table keyed by
  `brand_id` to track plan, limits, and Stripe IDs.

This plan keeps the login/onboarding flow simple while establishing a robust,
auditable multi-tenant data foundation ready for production scale.
