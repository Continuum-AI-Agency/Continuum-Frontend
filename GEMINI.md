# AGENTS.md: Continuum Frontend Development Guide

This document outlines the architectural and code quality rules for professional software development on the **Continuum** project, informed by the principles of **Clean Code** and **The Clean Coder** by Robert C. Martin. Our commitment is to deliver value with code that is inherently **easy to read, maintain, and test**.

---

## 1. Core Philosophy & Professionalism

Our approach is governed by the principles of software craftsmanship:

* **Readability is Priority #1:** Code is read far more often than it is written. We strive to make our code as clear, expressive, and direct as good prose. If it's hard to read, it's hard to maintain.
* **Commitment to Quality:** We are professionals. Code is only "done" when it is clean, fully tested, and passing all checks. We never check in code that we are not proud of.
* **The Boy Scout Rule (No Broken Windows):** If you find messy code, fix it. Continuous, minor refactoring is mandatory. **Always leave the code cleaner than you found it.**
* **Testing Mindset:** We follow a **Test-Driven Development (TDD) mindset**: a test fails, we write the minimal code to make it pass, and then we refactor. **Never write production code without an automated test.**
* **Defend Boundaries:** We treat external code (libraries, APIs) as boundaries. We must **wrap these external dependencies** (e.g., Supabase SDK) to limit their impact on our core domain logic. The wrapping layer must be clean and easily swapped.
* **Honest Estimates:** When asked for an estimate, it must be a **commitment** based on analysis and preparation, not a guess. We are responsible for communicating potential risks and honoring our commitments.

---

## 2. Code Quality (Clean Code)

These rules apply universally to all TypeScript, React, and Next.js code.

### Naming

* **Clarity over Brevity:** Use names that clearly articulate their purpose, location (Client/Server), and type. Avoid single-letter variables unless they are loop counters in trivial scopes.
    * **Good:** `calculateUserBmi`, `fetchUserDataFromServer`, `useAuthSession`
    * **Bad:** `calc`, `getData`, `auth`
* **Component Naming:** Components must be **PascalCase** and include a clear, descriptive noun (e.g., `SettingsModal`, `UserProfileCard`).
* **Server vs. Client Demarcation:** Functions responsible for Server Actions or Server-Side logic must be clearly named (e.g., `createPostAction`, `getServerPosts`).

### Functions & Components

* **Single Responsibility Principle (SRP):** Functions, components, and server actions must **do one thing, and one thing only**, and do it well. If a function's name contains "and," "or," or "handle," it's likely doing too much.
* **Smallness:** Functions should be small—ideally no more than **60 lines** of executable code. Components should aim to fit on a single screen.
* **Argument Count:** Functions should have the fewest arguments possible, ideally **zero or one**. Avoid three or more arguments unless a strong, specific case can be made (**prefer passing an object**).
* **Side Effects:** Functions must not contain hidden side effects.

### Comments

* **Code Should Be Self-Documenting:** Comments are a sign of failure to express intent in code. We only use comments for:
    * **Legal/License Notices.**
    * **Explanation of Intent/Why:** Explaining the reason for a non-obvious decision, **not what the code does.**
    * **TODOs/FIXMEs:** Used sparingly and removed as soon as the task is addressed.
* **Avoid Commenting Out Code:** **Delete old code.** Version control exists for a reason.

### Error Handling & TypeScript

* **Graceful Errors:** Do not return `null` or raw error codes from functions. Use `try/catch` blocks for expected failures and **throw custom, meaningful `Error` objects** that provide context.
* **Strict Typing:** All code must be strongly typed. Avoid `any`; use `unknown` or specific generics when type uncertainty is unavoidable. Enforce **Zod schemas strictly** on both client and server boundaries.

---

## 3. Architecture (Next.js / App Router)

### Server-First Principle & Rendering

* **Default to RSC/SSR:** All new components must default to being a **React Server Component (RSC)**. We must utilize Server-Side Rendering (SSR) via RSCs and Next.js caching to achieve optimal performance, faster initial load, and minimized client-side JavaScript bundle size. **Use Client Components only for interactivity.**
* **The "use client" Boundary:** The `"use client"` directive must be placed at the **highest possible level of the component tree**. Client Components should be small leaves that handle UI interaction, wrapping RSC-rendered content when possible (e.g., a Client button wraps Server-rendered content).

### Data Access & Supabase

* **Server-Side Data Only:** Direct database access (via Supabase SDK, PostgREST queries, or Server Actions) is **strictly forbidden in Client Components**. All data fetching must be proxied through:
    * **RSCs:** Direct `fetch()` calls or Server Actions.
    * **Route Handlers (`route.ts`):** For public/unauthenticated API endpoints.
* **Next.js Caching:** Utilize Next.js native `fetch` caching and revalidation (`next: { revalidate }`) to ensure predictable data freshness and optimal performance (SSR, SSG, ISR).

### State Management

* **Component State First:** Prefer `useState` or `useReducer` for local, component-specific state.
* **Context for UI/Cross-Cutting:** React Context is reserved only for low-frequency UI concerns like theme settings or global modal state. **No application-specific data** (e.g., lists of users, posts) should live in Context. External state libraries are prohibited unless cleared by the architectural lead.
* **Local Storage Use:** `localStorage` is permitted only for non-critical, ephemeral UI state that needs to persist across sessions (e.g., remembering a user's chosen theme, the last-used layout for a dashboard, or the open/closed status of a panel). **It must never be used for synchronization, storing sensitive data, or critical application data.**

---

## 4. UI/UX and Dependencies

### Styling & Accessibility

* **Style Guide Adherence:** All design decisions, spacing, color palettes, and typographic rules must **strictly adhere** to the guidelines set in the `styleguide.md` document.
* **Tailwind Preference:** We prioritize **Tailwind CSS 4 utility classes**. Custom CSS must be minimal and only used when utilities are insufficient.
* **Radix UI for Foundation:** All interactive primitives (buttons, menus, dialogs) must be built using **Radix UI components** (`@radix-ui/themes`, `@radix-ui/react-icons`) to ensure default, high-quality accessibility (ARIA, focus management, keyboard support).
* **Framer Motion:** Use **Framer Motion variants** for defined animation states. Complex animations must be lazy-loaded.

### Forms

* **Stack:** All forms must use the **React Hook Form + Zod stack** for controlled, performant, and type-safe validation.
* **Dual Validation:** Client-side Zod validation provides fast user feedback. **Server-side validation** (in Server Actions or Route Handlers) is mandatory to enforce invariants and security rules.

---

## 5. Linear Workflow & Project Operations

Our Linear workspace is the source of truth for delivery planning. Treat every interaction as a professional contract with the team.

### Estimation Discipline

* **Always estimate:** Every issue and sub-issue must carry an estimate from the team scale (`1, 2, 4, 8, 16`). Add or adjust the estimate before work begins.
* **Anchor on scope, not hope:** Estimate only after clarifying acceptance criteria, risks, and dependencies. Escalate unknowns instead of guessing.
* **Refine continuously:** Update estimates when scope changes. Communicate deltas in the issue comments and relevant standups.

### Issue Shape & Chunking

* **Right-size work:** Break initiatives into issues that fit within a single sprint window (≤16 points). Split anything larger into sequenced sub-issues.
* **Single outcome per issue:** Each issue should deliver one testable outcome. Use clear titles (`Verb + Object`) and maintain crisp acceptance criteria.
* **Connect the tree:** Use parent issues or projects to show hierarchy. Ensure sub-issues reference their parent so burndown and rollups stay accurate.

### Projects, Status, and Flow

* **Projects as umbrellas:** Every major initiative belongs to a Linear project. Keep project documents, milestones, and health updated weekly.
* **Status is signal:** Move issues through the workflow promptly (`Backlog → In Progress → Review → Done`). Leave a comment when blocking or handing off.
* **Link the work:** Attach related PRs, docs, analytics dashboards, or Looms directly to the issue. Cross-link dependent issues so risk can be tracked.
* **Close the loop:** Before marking an issue Done, confirm acceptance criteria, tests, and documentation updates are complete. Summarize outcomes in the final comment.

## 5. Linear Workflow & Project Operations

Our Linear workspace is the source of truth for delivery planning. Treat every interaction as a professional contract with the team.

### Estimation Discipline

* **Always estimate:** Every issue and sub-issue must carry an estimate from the team scale (`1, 2, 4, 8, 16`). Add or adjust the estimate before work begins.
* **Anchor on scope, not hope:** Estimate only after clarifying acceptance criteria, risks, and dependencies. Escalate unknowns instead of guessing.
* **Refine continuously:** Update estimates when scope changes. Communicate deltas in the issue comments and relevant standups.

### Issue Shape & Chunking

* **Right-size work:** Break initiatives into issues that fit within a single sprint window (≤16 points). Split anything larger into sequenced sub-issues.
* **Single outcome per issue:** Each issue should deliver one testable outcome. Use clear titles (`Verb + Object`) and maintain crisp acceptance criteria.
* **Connect the tree:** Use parent issues or projects to show hierarchy. Ensure sub-issues reference their parent so burndown and rollups stay accurate.

### Projects, Status, and Flow

* **Projects as umbrellas:** Every major initiative belongs to a Linear project. Keep project documents, milestones, and health updated weekly.
* **Status is signal:** Move issues through the workflow promptly (`Backlog → In Progress → Review → Done`). Leave a comment when blocking or handing off.
* **Link the work:** Attach related PRs, docs, analytics dashboards, or Looms directly to the issue. Cross-link dependent issues so risk can be tracked.
* **Close the loop:** Before marking an issue Done, confirm acceptance criteria, tests, and documentation updates are complete. Summarize outcomes in the final comment.