# Technology Stack

## Summary

Continuum is a Next.js 16 (App Router) application built with React 19, TypeScript 5, and Tailwind CSS 4. It uses Bun as both package manager and test runner, with Turbopack as the bundler in dev and production builds. State management is split across Zustand (canvas stores), Jotai (atomic UI state), and TanStack Query (server data caching).

## Languages

**Primary:**
- TypeScript 5.9.3 — all application code in `src/`

**Secondary:**
- JavaScript — config files (`next.config.ts` compiled, `cache-handler.js`, scripts in `scripts/`)

## Runtime

**Environment:**
- Node.js (Next.js runtime for server components and API routes)
- Bun 1.3.5 (package manager, test runner, script execution)

**Package Manager:**
- bun@1.3.5
- Lockfile: `bun.lock` present (package-lock.json also present but secondary)

## Frameworks

**Core:**
- next ^16.1.6 — App Router, RSC, Server Actions, Route Handlers
- react ^19.2.4 — React Server Components, concurrent features
- react-dom ^19.2.4

**Routing:**
- Next.js App Router with file-based routing under `src/app/`
- Protected routes via middleware at `src/middleware.ts`

**Testing:**
- Bun test runner (built-in, no separate jest/vitest in use despite vitest being in devDependencies)
- happy-dom ^20.8.3 — DOM environment for tests
- @testing-library/react ^16.3.2 — component testing utilities
- Test preload: `bunfig.toml` → `bun-test-setup.ts`

**Build/Dev:**
- Turbopack (Next.js built-in) — both `bun dev` and `bun run build` use `--turbopack`
- @tailwindcss/postcss ^4.2.1 — PostCSS plugin for Tailwind v4

## Key Dependencies

**Canvas / Visual Editors:**
- @xyflow/react ^12.10.1 — AI Studio workflow canvas (nodes, edges, handles)
- @dnd-kit/core ^6.3.1, @dnd-kit/sortable ^10.0.0, @dnd-kit/utilities ^3.2.2 — drag-and-drop across planners and canvases

**State Management:**
- zustand ^5.0.11 — canvas stores (`useStudioStore`, `useCampaignStore`, `useCalendarStore`), each with 50-snapshot undo/redo
- jotai ^2.18.0 — lightweight atomic state for UI concerns
- @tanstack/react-query ^5.90.21 — server state caching, mutations
- @tanstack/react-table ^8.21.3 — data tables
- @tanstack/react-virtual ^3.13.21 — virtualized lists

**AI / Streaming:**
- ai ^6.0.116 (Vercel AI SDK) — AI streaming primitives
- @ai-sdk/react ^3.0.118 — `useChat` hook for chat UIs
- streamdown ^2.4.0 + @streamdown/* — streaming markdown rendering with code, math, mermaid, CJK support

**Forms / Validation:**
- react-hook-form ^7.7.2 — all forms
- @hookform/resolvers ^5.2.2 — Zod resolver
- zod ^4.3.6 — schema validation at all client/server boundaries

**Charting / Visualization:**
- recharts ^3.8.0 — React-based charts
- lightweight-charts ^5.1.0 — TradingView-style financial charts for paid media metrics
- maplibre-gl ^5.19.0 — geographic maps

**3D / Animation:**
- @react-three/fiber ^9.5.0, @react-three/drei ^10.7.7, three ^0.182.0 — 3D scenes
- framer-motion ^12.35.1, motion ^12.35.1 — animation variants

**UI Utilities:**
- @rive-app/react-webgl2 ^4.27.0 — Rive animation playback
- media-chrome ^4.18.0 — custom media player controls
- cmdk ^1.1.1 — command palette
- sonner ^2.0.7 — toast notifications
- embla-carousel ^8.6.0 — carousels
- react-resizable-panels ^4.7.2 — resizable panel layouts
- react-dropzone ^14.4.1 — file upload drop zones
- date-fns ^4.1.0 — date utilities
- react-day-picker ^9.14.0 — calendar date picker
- nanoid ^5.1.6, uuid ^13.0.0 — ID generation
- lz-string ^1.5.0 — string compression (persisted state)
- html2canvas ^1.4.1, jspdf ^2.5.2 — PDF/screenshot export
- tokenlens ^1.3.1 — LLM token counting

**Supabase:**
- @supabase/supabase-js ^2.98.0 — JS client
- @supabase/ssr ^0.8.0 — SSR/Next.js cookie-based auth helpers
- supabase ^2.77.0 — CLI (type generation)

**Analytics:**
- mixpanel-browser ^2.75.0 — product analytics (production only)
- @vercel/analytics ^1.6.1 — Vercel Analytics
- @vercel/speed-insights ^1.3.1 — Core Web Vitals tracking

## Styling

**Framework:**
- tailwindcss ^4.2.1 (v4 CSS-first config via `src/app/globals.css`)
- PostCSS via `postcss.config.mjs` using `@tailwindcss/postcss`
- tw-animate-css ^1.4.0 — animation utility classes

**Component Libraries:**
- @base-ui/react ^1.7.0 — headless primitives (menus, dialogs, tabs, accordion, popovers). Radix has been removed; `@radix-ui/*` survives only transitively under `cmdk`
- shadcn/ui — `base-nova` preset (`components.json` `style`; the `base` field is derived from that prefix, not written), CSS variables
  - Config: `src/app/globals.css` is the CSS entry, icon library is `lucide`
- lucide-react ^0.575.0 — icon set
- @heroicons/react ^2.2.0 — secondary icon set
- class-variance-authority ^0.7.1, clsx ^2.1.1, tailwind-merge ^3.5.0 — class composition utilities
- next-themes ^0.4.6 — theme switching (dark/light mode)

## Path Aliases

- `@/*` → `./src/*` (configured in Next.js, referenced throughout)

## Dev Tooling

**Linting:**
- eslint ^9.39.4 — flat config (`eslint.config.mjs`)
- eslint-config-next 15.5.4 — extends `next/core-web-vitals` and `next/typescript`
- No Prettier config detected (no `.prettierrc`)

**Type Checking:**
- typescript ^5.9.3
- Note: `tsconfig.json` is deleted per git status — project relies on Next.js built-in TypeScript support with Turbopack

**Shadcn CLI:**
- shadcn ^3.8.5 — component scaffolding

**Type Generation:**
- `scripts/generate-supabase-types.mjs` — generates Supabase database types
- Output: `src/lib/supabase/types.ts`

## Configuration Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js config: Turbopack, Server Actions 3 MB limit, root redirect to `/login` |
| `eslint.config.mjs` | ESLint flat config extending Next.js rules |
| `bunfig.toml` | Bun config: test preload file |
| `bun-test-setup.ts` | Test DOM setup (happy-dom), mocks for `server-only`, `next/navigation`, theme provider |
| `components.json` | shadcn/ui config: new-york style, zinc base, RSC enabled |
| `postcss.config.mjs` | PostCSS: Tailwind v4 plugin only |
| `cache-handler.js` | Custom Next.js cache handler (dev only, prevents cache growth) |

## Notable Observations

- `tsconfig.json` is deleted in working tree (`D tsconfig.json` in git status). The project relies entirely on Next.js/Turbopack's internal TypeScript handling. No explicit path alias config is needed because Next.js handles `@/*`.
- `vitest` and `vite` appear in devDependencies but the project uses **Bun's built-in test runner**, not Vitest. These are likely legacy or unused.
- Both `framer-motion` and `motion` are listed separately — both are the same package family (Motion for React). This is redundant.
- Mixpanel token is hardcoded in source (`src/components/analytics/MixpanelInit.tsx`) rather than using an env var.
- `package-lock.json` exists alongside `bun.lock`, suggesting occasional npm usage but Bun is the canonical package manager.

---

*Stack analysis: 2026-03-25*
