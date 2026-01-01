# Organic Media Module - Architecture (Final)

This document is the source of truth for the Organic Media module architecture and execution plan.

## Feature Overview
- Goal: Build an Organic Media hub that enables Create, Edit, Schedule, and Multi-Post with a calendar-first UI and a left Content Creation panel.
- Primary users: Solo Creator (brand and team users can also log in and create/edit/execute).
- Success metric: Experimental MVP (no KPI commitment yet).
- Constraints: Next.js RSC-first, Radix primitives, RHF + Zod, server-only data access, follow styleguide.
- Assumptions:
  - IG + LinkedIn MVP; other platforms are extrapolated from these patterns.
  - Calendar is 70% width (right). Content Creation panel is 30% width (left) with expand-to-100%.
- Collaboration footnote: Real-time collaboration is deferred.

## Problem Statement
- User pain: Disconnected creation, scheduling, and cross-platform posting workflows.
- Why now: Trends and Competitor insights already exist and can ground generation.

## Scope
- In-scope (MVP):
  - Calendar hub with scheduling + simultaneous multi-post per draft.
  - Content Creation panel (30% left) with expand-to-100% mode.
  - Pre-step panels: Trends -> Competitors -> Agent Reception -> Draft composer.
  - Agent Reception rendered with `src/components/ui/SafeMarkdown.tsx` after Generate.
  - Instagram + LinkedIn (LinkedIn focuses on Articles with media attachments).
- Out-of-scope (MVP):
  - Real-time collaboration.
  - Inbox/comments management.
  - Non-IG/LinkedIn platform parity.

## Requirements
### Functional
- Create/Edit/Schedule/Multi-Post for IG + LinkedIn.
- Trend tagging as part of creation.
- Separate pre-step panels: Trends -> Competitors -> Agent Reception -> Draft composer.
- Simultaneous multi-post: per draft, user explicitly selects which platforms to publish to.
- Crosspost flow and UX must mirror the Crosspost video behavior and visual cues.
- Generate creates 1-3 drafts per day based on backend attention-optimization logic.
- Suggested post times are required in the planning flow (recommended times per day).
- Per-draft platform tags are visible on calendar cards and draft list items.
- Instagram required metadata (location, tags, reel cover, share-to-feed) is configured in the UI and passed to backend operations.

### Non-functional
- RSC shells for data; client leaf components for drag/drop, selection, and panel expansion.
- Accessible Radix primitives; predictable caching and revalidation.

## UX + Workflows
- Key journey:
  1) Select Trends -> select Competitor posts -> Generate -> Agent Reception (streaming) -> Draft creation -> Edit -> Schedule -> Multi-Post.
- Critical screens:
  - Calendar Hub (70% right) + Content Creation panel (30% left).
  - Expanded Content Creation (100% width, calendar hidden).
  - Drafts list or grid (within Content Creation).
- Agent Reception behavior:
  - Calendar reserves one placeholder per day immediately after Generate.
  - Drafts appear on the calendar only after streaming content begins.
  - Streaming fills placeholders as content arrives.

## Architecture Summary
- High-level approach:
  - Calendar-first RSC with a left Content Creation panel.
  - Crosspost composer with per-platform toggles and previews.
  - Generation pipeline grounded by Trends + Competitor posts.
- Data flow:
  - RSC fetch -> Trends/Competitors selection -> Generate -> Agent Reception -> Drafts -> Schedule queue -> Publish jobs.
- Key components:
  - CalendarGrid, ContentCreationPanel, TrendPanel, CompetitorPanel, AgentReceptionPanel, CrosspostComposer.
- Integrations and dependencies:
  - Supabase server actions (wrapped), platform publishing abstraction for IG/LinkedIn.

## Platform Constraints (Pending API Confirmation)
- Instagram publishing uses container creation and a publish step (`/media` and `/media_publish`).
- Media for Instagram publishing is supplied via public `image_url`/`video_url`, with optional carousel handling.
- LinkedIn posts require asset registration and upload for images/videos before creating a share.
- LinkedIn Article posting for MVP maps to a URL/article share (shareMediaCategory `ARTICLE`) with title/description/thumbnail fields.
- Instagram official docs must be re-validated (Meta Postman collection is the current source of truth).

## Edge Cases + Failure Modes
- Scheduling conflicts, missing required media, platform incompatibility, publish errors.
- Streaming delays or partial generation for 1-3 drafts/day.

## Workstream Plan (Delegable)
1) UX + Information Architecture
2) Calendar + Scheduling Core
3) Content Creation Panel + Crosspost Composer
4) Trends + Competitors + Agent Reception
5) Publishing Abstraction + Crosspost Rules
6) Documentation + Spec Maintenance

## Sequencing
- Critical path:
  1) UX + IA -> 2) Calendar + Scheduling -> 3) Content Creation + Composer -> 4) Trends/Competitors + Agent Reception -> 5) Publishing Abstraction.
- Parallelizable:
  - Documentation can run continuously in parallel.
  - Publishing abstraction can start after UX workflows are stabilized.
- Milestones:
  - M1: Calendar + Content Creation layout wired with placeholders.
  - M2: Generation and Agent Reception streaming.
  - M3: Draft edits + schedule + multi-post.

## Testing + Quality
- Test strategy:
  - Unit tests for state reducers, scheduling logic, and draft validation.
  - Component tests for calendar card rendering and platform tags.
  - Integration tests for Generate -> Agent Reception -> Draft creation flow.
- QA checklist:
  - Multi-post selection explicit per draft.
  - Platform tags appear on calendar and draft list.
  - Streaming placeholders appear and resolve correctly.

## Roll Out + Observability
- Release plan:
  - Internal MVP for Solo Creator.
  - Enable IG + LinkedIn only, with feature flags if needed.
- Metrics/monitoring:
  - Generation success rate, draft completion rate, publish success rate.
- Logging/alerts:
  - Publish failures per platform, schedule failures, streaming errors.

## Risks + Mitigations
- Risk: API constraints differ from assumptions.
  - Mitigation: Validate IG and LinkedIn publish constraints in official docs before implementation.
- Risk: Crosspost parity is unclear without an explicit checklist.
  - Mitigation: Extract video behaviors into a checklist and review with stakeholders.

## Reference Assets (Must Inform UX)
- Crosspost animation video:
  - https://crosspost-website.s3.us-east-1.amazonaws.com/animation-beta.mp4
- Crosspost apps:
  - https://justcrosspost.app/
  - https://www.crosspost.app/
- Inspiration products:
  - https://buffer.com/
  - https://later.com/
  - https://github.com/inovector/mixpost
- Mobbin references:
  - https://mobbin.com/screens/4114d03e-1be6-4ec2-96ba-f52f21faf159?utm_source=copy_link&utm_medium=link&utm_campaign=screen_sharing
  - https://mobbin.com/screens/b2361cb1-96cd-4806-88a4-6ebc8bfb8f64?utm_source=copy_link&utm_medium=link&utm_campaign=screen_sharing
  - https://mobbin.com/screens/2b32899d-6868-4595-a3b9-4d9eb8fe7642?utm_source=copy_link&utm_medium=link&utm_campaign=screen_sharing
- Local reference images:
  - /Users/duane/Downloads/2747ee6607873e41a0d0a4c8cd6d1091.webp
  - Assembly Web 0.png

## Sub-Agent Prompts (Kickoff Ready)
### 1) UX + Information Architecture
Design the IA and user journeys for the Organic Media module. Define the 70/30 split, the 100% Content Creation mode, and the pre-step sequence (Trends -> Competitors -> Generate -> Agent Reception -> Composer). Provide screen list, core interactions, and state transitions. Must mirror the Crosspost video UX.

### 2) Calendar + Scheduling Core
Define month/week calendar behaviors, drag/drop rules, bulk actions, and card states for IG + LinkedIn. Show how multi-post is represented per draft (platform tags like Crosspost). Include suggested posting times and placeholder slots for streaming content (reserve one per day on Generate).

### 3) Content Creation Panel + Crosspost Composer
Design the Content Creation panel and full-screen composer. Include per-draft platform selection, per-platform previews, and edit overrides. Align with Crosspost video behavior. Focus on IG + LinkedIn (LinkedIn Article + media attachments) and required IG metadata.

### 4) Trends + Competitors + Agent Reception
Define how Trend selection and Competitor post selection feed generation. Specify the Agent Reception UI rendered via `src/components/ui/SafeMarkdown.tsx`, including streaming states and placeholder cards on the calendar (reserve one per day, then fill).

### 5) Publishing Abstraction + Crosspost Rules
Draft the IG + LinkedIn publish abstraction. Define validation rules, compatibility constraints, and error handling. Include assumptions on required fields for IG media publishing and LinkedIn article sharing (validate against docs).

### 6) Documentation + Spec Maintenance
Maintain this doc as the source of truth. Expand requirements, data models, edge cases, and sequencing. Track open questions and decisions.