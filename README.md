This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# Continuum-Frontend

This repository contains the Continuum web application. The app code uses Next.js 15 and React 19.

## Tech stack

- React 19 + Next.js 15 (App Router, React Server Components)
- TypeScript 5
- Tailwind CSS 4 + PostCSS
- Radix UI (`@radix-ui/themes`, `@radix-ui/react-icons`) for accessible primitives and theming
- Framer Motion for animations
- React Hook Form + Zod for forms and validation
- Data fetching via Next.js server `fetch` with caching/revalidation, plus optional client-side stale-while-revalidate when needed
- ESLint (Next config)

## Frontend architecture

- Server-first
  - Prefer React Server Components for data access and rendering.
  - Use Client Components only for interactivity (add `"use client"` at the top).
- Routing & layouts
  - App Router in `src/app/` with nested `layout.tsx` per route group, and route handlers in `src/app/api/*/route.ts`.
  - Use route groups `(group)` to separate marketing vs. app areas.
- UI system
  - Base components built with Radix primitives and themed via `@radix-ui/themes`.
  - Centralized design tokens and theme config; icons via `@radix-ui/react-icons`.
- Styling
  - Tailwind CSS 4 utilities; global styles in `src/styles/globals.css`.
  - Co-locate component styles when necessary; avoid deep custom CSS where utilities suffice.
- Data fetching & caching
  - On the server: `fetch()` with `cache` and `next: { revalidate }` to choose SSR/SSG/ISR per route.
  - On the client: use a minimal stale-while-revalidate helper for non-blocking background refreshes when interactivity requires it.
  - Route handlers can proxy backend services to keep secrets server-side and normalize responses.
- Forms & validation
  - `react-hook-form` for performant forms; validate with Zod schemas.
  - Validate again on the server to enforce invariants.
- State management
  - Prefer local/component state and server-derived state.
  - Use React Context sparingly for cross-cutting UI state; avoid additional global state libraries unless a concrete need emerges.
- Animations
  - Framer Motion variants for entrance/exit and layout transitions; lazy-load where appropriate.
- Accessibility
  - Use Radix primitives for focus management and ARIA; ensure keyboard and screen reader support.