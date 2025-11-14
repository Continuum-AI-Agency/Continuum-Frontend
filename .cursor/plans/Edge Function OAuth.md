<!-- 3f77e48f-3c35-44bb-8ca7-e369d4ebc8c8 1352cfe1-3f94-481a-850c-ac2ef7fc4fbf -->
# Edge Function OAuth family for Google & Meta

#### Scope

- Not for login; provider OAuth for Google (YouTube + optional Ads) and Meta Marketing (FB/IG).
- Callback handled in Supabase Edge Functions. Tokens are stored per integrating `user_id`.
- Discovered business assets (channels, ad accounts, pages) are assigned per brand profile via a join table so users can choose which assets each brand may use.
- Redirect: reflect initiating request origin (from signed `state`) and validate host against an allowlist.

#### Database (user‑centric with asset assignments)

- Migration: `supabase/migrations/20251105_user_integrations.sql`
- Tables:
- `user_integrations`:
- `id uuid pk`, `user_id uuid not null`, `provider text not null`, `platform_user_id text`, `platform_email text`, `status text`,
`access_token_encrypted bytea`, `refresh_token_encrypted bytea`, `expires_at timestamptz`, `metadata jsonb`, timestamps.
- Unique: `(user_id, provider, coalesce(platform_user_id,''))`.
- `integration_accounts` (provider business assets under an integration):
- `id uuid pk`, `integration_id uuid fk → user_integrations(id) on delete cascade`,
`external_account_id text not null`, `type text` (e.g., `youtube_channel`, `ads_customer`, `meta_ad_account`, `meta_page`),
`name text`, `status text`, `raw_payload jsonb`, timestamps.
- Unique: `(integration_id, external_account_id)`.
- `brand_profile_integration_accounts` (asset assignments):
- `id uuid pk`, `brand_profile_id uuid not null`, `integration_account_id uuid not null fk → integration_accounts(id) on delete cascade`,
`alias text`, `settings jsonb`, timestamps.
- Unique: `(brand_profile_id, integration_account_id)`.
- Security & RLS:
- Enable `pgsodium`; add helpers `encrypt_token(text) → bytea`, `decrypt_token(bytea) → text` (SECURITY DEFINER; service role only).
- `user_integrations`: only owner (`auth.uid() = user_id`) can select/modify; tokens never exposed to others.
- `integration_accounts`: owner may select; additionally expose assigned assets to brand members either via a secure policy using `exists` on the join table and brand membership, or via a read‑only view.
- `brand_profile_integration_accounts`: inserts require caller is both owner of the parent integration and a member of the target brand; brand members can select assigned rows for their brands.

#### Edge Functions (Deno)

- Shared: `supabase/functions/_shared/oauth.ts`
- `buildSignedState({ brandProfileId, userId, origin, provider, exp })` / `verifySignedState()` with HMAC (`OAUTH_STATE_SECRET`).
- `renderPopupResultHTML({ type: 'integration:success'|'integration:error', provider, message })` → postMessage + close.
- Google: `supabase/functions/oauth-google/index.ts`
- GET `/start`: `Authorization: Bearer <Supabase JWT>`, `brand`, optional `callback_url`.
- Validate user + brand membership; sign state; build Google auth URL with scopes (YouTube + userinfo; Ads scopes included but Ads discovery gated on env).
- Use `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`. Return `{ url }`.
- GET `/callback`: verify state; exchange code at `https://oauth2.googleapis.com/token` → access/refresh/expiry.
- Fetch YouTube channels: `GET https://www.googleapis.com/youtube/v3/channels?mine=true&part=id,snippet`.
- If `GOOGLE_ADS_DEVELOPER_TOKEN` present, call `POST https://googleads.googleapis.com/v15/customers:listAccessibleCustomers` (optional `GOOGLE_ADS_LOGIN_CUSTOMER_ID`); otherwise skip Ads discovery.
- Upsert `user_integrations` (tokens encrypted) and discovered `integration_accounts` (channels/customers). Do NOT auto‑assign to brand.
- Respond with popup success.
- Meta: `supabase/functions/oauth-meta/index.ts`
- GET `/start`: same pattern; build Facebook OAuth URL (`/dialog/oauth`) with scopes: `ads_read, ads_management, business_management, pages_show_list, pages_read_engagement, instagram_basic, instagram_manage_insights, instagram_content_publish, read_insights, email`.
- GET `/callback`: verify state; exchange code at `https://graph.facebook.com/v21.0/oauth/access_token`, then exchange for long‑lived token.
- Fetch `me`, `me/adaccounts` (id,account_id,name,business{id,name},permissions), `me/accounts` (pages + IG), optionally `me/businesses` for enrichment.
- Upsert `user_integrations` (encrypted token, expiry) and `integration_accounts` (ad accounts/pages). Do NOT auto‑assign to brand.
- Respond with popup success.
- POST `/deauth-callback`: validate signed request; locate `user_integrations` by `provider='meta'` and `platform_user_id`; mark `revoked` (or delete cascading accounts).

#### Assignment APIs

- Next.js route or Edge Function to manage per‑brand selections:
- POST `/api/integrations/assign` → { brandProfileId, integrationAccountIds[] } → upsert rows in `brand_profile_integration_accounts` (auth requires owner + brand member).
- POST `/api/integrations/unassign` → remove rows.
- GET `/api/integrations/assigned?brand=<id>` → list assigned assets for UI (safe metadata only).

#### Frontend wiring

- `src/lib/api/integrations.ts`:
- `startIntegration(provider, brandProfileId, callbackUrl?)` → calls Edge `/start`, returns URL.
- `assignAssets(brandProfileId, integrationAccountIds)` / `unassignAssets(...)`.
- `src/app/(post-auth)/integrations/page.tsx`:
- Buttons: "Connect Google", "Connect Meta" → popup flow; on success, refresh and show asset picker.
- Asset picker lists discovered assets per provider and lets the user assign them to the active brand.

#### Env & secrets

- Edge Functions: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OAUTH_STATE_SECRET`, `ALLOWED_REDIRECT_HOSTS`.
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Optional for Ads discovery: `GOOGLE_ADS_DEVELOPER_TOKEN` (distinct from client id/secret), optional `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.
- Meta: `META_APP_ID`, `META_APP_SECRET`.

#### Security

- HMAC‑signed `state` with short TTL; validate origin host ∈ `ALLOWED_REDIRECT_HOSTS`.
- All writes use service‑role client; RLS shields tokens (owner‑only).
- Brand members only see assets assigned to their brands (policies or view).

#### QA

- Google: OAuth completes, channels discovered, Ads discovery skipped without developer token; no auto‑assignment.
- Meta: Long‑lived token stored, ad accounts/pages discovered; no auto‑assignment; deauth works.
- Assign/unassign endpoints enforce owner+brand membership; assigned assets visible to brand members.

### To-dos

- [ ] Add brand_integrations tables, RLS, pgsodium key and encrypt/decrypt SQL fns
- [ ] Create _shared/oauth.ts for state signing and popup HTML rendering
- [ ] Implement oauth-google /start with user+brand validation and auth URL
- [ ] Implement oauth-google /callback token exchange and YouTube fetch; skip Ads if no dev token
- [ ] Implement oauth-meta /start with scopes and state
- [ ] Implement oauth-meta /callback token exchange, long-lived token, assets fetch and persist
- [ ] Add oauth-meta /deauth-callback to handle signed deauthorization events
- [ ] Add src/lib/api/integrations.ts startIntegration helper with Authorization header
- [ ] Update IntegrationsPage to use popup flow for Google and Meta
- [ ] Document and set required env vars and allowed redirect hosts
- [ ] Run through QA checklist and verify data stored and UI updates