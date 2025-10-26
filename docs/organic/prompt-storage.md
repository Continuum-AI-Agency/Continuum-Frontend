# Prompt Library Storage Design

Continuum already relies on Supabase (Postgres + Storage) for authenticated reads and writes. The prompt library can live in the same stack without introducing a new persistence layer.

## Recommended Schema (Postgres via Supabase)

```
create table organic_prompts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  description text,
  content text not null,
  category text not null default 'Custom',
  source text not null default 'custom', -- 'preset' or 'custom'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organic_prompts_brand_id_idx on organic_prompts (brand_id);
```

- **brand_id** scopes prompts per customer/brand profile.
- **source** allows the UI to merge server presets with editor-defined prompts.
- RLS policy can mirror the patterns used for other brand-scoped resources (e.g., `brand_id = auth.jwt()->>'brand_id'`).

For server defaults, seed rows with `source = 'preset'` and lock them behind an RLS policy that permits read but denies write/delete.

## API Approach

Expose a simple CRUD route (REST or RPC) in Supabase:

- `GET /organic/prompts?brand_id=...`
- `POST /organic/prompts` `{ name, description, content, category }`
- `PATCH /organic/prompts/:id`
- `DELETE /organic/prompts/:id`

The front-end can continue to hydrate from cached presets, then overlay brand-specific prompts fetched from this endpoint. Optimistic updates mirror the current local-storage UX.

## Why Postgres (Supabase) and not NoSQL?

1. **Consistency with existing stack:** the rest of the organic module already relies on Supabase auth and Postgres. Staying in one datastore keeps migrations, RLS policies, and backups centralized.
2. **Relational joins:** prompts will likely be linked to brands, campaigns, or saved plans. SQL joins make it straightforward to query prompts alongside other organic artifacts.
3. **RLS & auditing:** Supabase’s Postgres layer provides row-level security and timestamp auditing out of the box, giving fine-grained access control without custom logic.

NoSQL could work for a simple document store, but it introduces another dependency (new SDK, auth, hosting). For this use case—structured rows keyed by `brand_id`—Postgres with Supabase is the pragmatic choice.
