# Continuum Onboarding & Collaboration Guide

This document describes the end-to-end onboarding flow, required Supabase schema, and collaboration model for Continuum. Follow it alongside `AGENTS.md` and `styleguide.md` when implementing new features.

---

## 1. Onboarding Flow Overview

Continuum’s onboarding is a three-step wizard rendered in `src/components/onboarding/OnboardingFlow.tsx`. All user input should persist to the server immediately so progress is durable across sessions and collaborators.

### Step 1 – Brand Profile

* **Fields**: `name`, `industry`, optional `brandVoice`, optional `brandVoiceTags[]`, optional `targetAudience`, `timezone`.
* **Documents**: Users can upload files or link third-party design systems (Canva, Figma, Google Drive, SharePoint). Uploads queue an embed job via the `/api/onboarding/documents` route; external connectors return metadata through a popup handshake.
* **Goal**: Capture rich brand context to seed AI generation. All data is scoped by a `brand_profile_id`.

### Step 2 – Integrations

* Each integration launches an OAuth popup (`/oauth/start`) that exchanges credentials with Supabase Auth.
* Once the provider responds, Continuum persists an integration row and syncs account data (e.g., ad accounts, pages) to `brand_integration_accounts`.
* The UI shows live account lists and last synced timestamps.

### Step 3 – Review

* Displays the consolidated brand profile, document list, and connected integrations with their accounts.
* Completing onboarding flips the brand profile status to `active` and redirects to the dashboard.

> **Key Principle**: The `brand_profile_id` is the source of truth for every downstream feature (campaigns, analytics, reporting). No data should exist without a foreign key to the owning brand profile.

---

## 2. Supabase Schema

All tables must enforce Row-Level Security (RLS) using the membership and role model described in section 3.

### 2.1 Core Tables

| Table | Purpose | Important Columns |
| ----- | ------- | ----------------- |
| `brand_profiles` | Top-level entity for everything in the workspace. | `id uuid pk`, `name`, `industry`, `brand_voice text`, `brand_voice_tags text[]`, `target_audience text`, `timezone text`, `status text` (`draft` \| `active`), `created_by uuid` (FK → `auth.users`), `created_at`, `updated_at`. |
| `brand_profile_members` | Maps users to brand profiles with roles. | `brand_profile_id uuid fk`, `user_id uuid fk`, `role text` (`owner` \| `admin` \| `operator` \| `viewer`), `invited_by uuid`, `invited_at`, `accepted_at`, timestamps. Composite PK `(brand_profile_id, user_id)` recommended. |
| `brand_documents` | Tracks brand collateral for embedding. | `id uuid pk`, `brand_profile_id uuid fk`, `source text` (`upload` \| `canva` \| `figma` \| `google-drive` \| `sharepoint`), `storage_path text` or `external_url text`, `status text` (`processing` \| `ready` \| `error`), `size_bytes bigint`, `uploaded_by uuid`, `embed_job_id uuid`, timestamps. |
| `brand_integrations` | Stores OAuth credentials per platform. | `id uuid pk`, `brand_profile_id uuid fk`, `provider text` (`youtube`, `instagram`, etc.), `status text`, `access_token_encrypted text`, `refresh_token_encrypted text`, `expires_at timestamptz`, `last_synced_at`, `created_by uuid`, `metadata jsonb`, timestamps. |
| `brand_integration_accounts` | Provider accounts returned after OAuth. | `id uuid pk`, `integration_id uuid fk`, `external_account_id text`, `name text`, `status text`, `raw_payload jsonb`, timestamps. |
| `brand_onboarding_progress` *(optional)* | Track wizard progress for analytics. | `brand_profile_id`, `step int`, `completed_at`, `updated_at`. |

### 2.2 Supporting Infrastructure

* **Supabase Storage**: bucket `brand-documents` for uploads; store object path in `brand_documents.storage_path`.
* **Embedder Edge Function**: triggered after upload to generate embeddings (update `brand_documents.status` and reference).
* **Secrets**: Use Supabase Vault or an external KMS to encrypt tokens stored in `brand_integrations`.

---

## 3. Collaboration & Access Control

Continuum supports “multiplayer” access to brand profiles. Roles determine what users can do.

### 3.1 Roles

* **Owner**: full control; can manage billing, delete brand profiles, manage invitations.
* **Admin**: manage brand data, documents, integrations, and invitations (except removing owners).
* **Operator**: run campaigns and update creative assets but cannot alter integrations or membership.
* **Viewer**: read-only dashboards and exports.

### 3.2 RLS Policies

* `brand_profiles`: allow select/update/delete only for members with appropriate roles; insert restricted to authenticated users.
* `brand_profile_members`: select allowed to members; insert/update restricted to owners/admins; enforce at least one owner per profile.
* `brand_documents`, `brand_integrations`, `brand_integration_accounts`: select restricted to members; insert/update restricted to roles (`operator`+ for documents, `admin`+ for integrations).
* All downstream tables must include `brand_profile_id` and adopt similar RLS joins to ensure tenant isolation.

### 3.3 Invitations via Magic Links

1. Owner/Admin creates a pending membership row in `brand_profile_members` with a unique invite token.
2. System emails a magic-link to the user; logging in via the link associates their `auth.users` record to the pending membership.
3. After acceptance, the invite row is finalized (`accepted_at` set). Unaccepted invites should expire automatically.

---

## 4. Implementation Notes

* Create the `brand_profiles` row as soon as onboarding starts. All subsequent actions reference the `brand_profile_id`.
* Server actions (`src/app/onboarding/actions.ts`) should mutate Supabase state immediately, refresh client caches, and handle concurrent updates.
* When real provider APIs are available, replace mock account generation in `markPlatformConnectionAction`/`refreshPlatformConnectionAction` with actual fetches and secure token storage.
* Document uploads must call the embedder function asynchronously; update `brand_documents.status` when the job completes.
* For analytics, consider logging onboarding milestones (step transitions, integrations connected, documents added) in a separate events table under the same `brand_profile_id`.

---

## 5. Workspace Settings & Brand Switching

Continuum exposes workspace management under `/settings` for authenticated users. The page is backed by server actions in `src/app/(post-auth)/settings/actions.ts`.

* **Brand profile management**: Rename the active brand, view completion status across all brands, and switch the active brand. Switching an incomplete brand automatically redirects back to onboarding so teams finish required steps.
* **Magic-link invitations**: Generate role-scoped invites (Admin/Operator/Viewer). Links are derived from `NEXT_PUBLIC_SITE_URL` and recorded in the brand metadata so they can be revoked later.
* **Membership controls**: Owners are preserved; admins can remove other members via email. Every brand maintains a `members` list aligned with `brand_profile_members`.
* **New brand creation**: Users can spin up an additional brand profile, which immediately redirects into onboarding for that brand, reusing the same flow described above.

The dashboard header also surfaces a brand switcher so users can move between brands without visiting settings.

---

## 6. Open Questions & Future Work

1. **Embedder Pipeline**: finalize the edge function contract and monitoring (success/failure hooks).
2. **Token Storage**: decide on encryption strategy for OAuth tokens (KMS vs Supabase Vault).
3. **Cross-Team Collaboration**: determine whether a user can hold different roles across multiple brand profiles and how billing ties in.
4. **Audit Trails**: capture who added/removed integrations or documents for compliance.
5. **Real-Time Sync**: evaluate whether Supabase realtime channels should broadcast onboarding updates to collaborators viewing the flow simultaneously.

Keep this document updated as architecture evolves. Any schema changes should be accompanied by migration scripts and RLS policy updates.
