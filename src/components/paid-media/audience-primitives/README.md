# Audience primitives (scaffolding)

These primitives will be the building blocks for the Audience Builder surfaces (create/edit pages, saved list/detail, DCO selector, campaign node previews). Keep them small, focused, and Radix/Tailwind-based.

- `AudienceLayerBadge` – concise badge set showing psychographic vs targeting layers and platform override flags.
- `CompatibilityCallout` – status + description for Meta/Google compatibility (warnings, deprecated fields, missing geo/age).
- `ReachBadge` – reach/viability chip (Meta lower/upper bounds; Google coverage/index).
- `LookalikeToggle` – 1–5% expansion control with seed validation messaging.
- `PromptPreviewCard` – deterministic preview of the creative prompt generated from `psychographic_layer`.
- `TargetingSummaryList` – SSR summary of geo/age/interests/behaviors/devices and overrides, with truncation + tooltip.
- `PayloadDiffDrawer` – compares saved preset vs current edits before save/publish.
- `SavedAudienceCard` – compact card for list view (concept name, last used, platforms, health).
- `ViabilityStatusBar` – shows preflight blockers (empty payload, deprecated interests, API 429 risk).

Implementation notes:
- Default to server components; mark only interactive leaves with `"use client"`.
- Accept typed props derived from `UnifiedAudienceObject` Zod schemas; avoid `any`.
- Keep visual tokens aligned to `docs/styleguide.md`; rely on Radix primitives for accessibility.
