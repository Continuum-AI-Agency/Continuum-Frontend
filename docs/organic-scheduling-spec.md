# Organic Scheduling Spec

## Scope
This spec defines scheduling behavior for the Organic Planner (`primitives`) and Organic Executor (`DailyTemplatesPanel`).

## Canonical Rules
1. `timeLabel` in planner cards must use `h:mm AM/PM` 12-hour format.
2. A draft can be marked `scheduled` only when:
   - it is assigned to a calendar day (not `Unscheduled`), and
   - it has a valid `timeLabel`.
3. Executor `scheduledAt` values must be valid `datetime-local` strings (`YYYY-MM-DDTHH:mm`) and must be in the future.
4. Unknown/invalid schedule values are rejected in UI handlers and do not mutate store state.

## Planner Behavior
- Quick custom time edits normalize input to canonical `h:mm AM/PM`.
- Invalid custom time input is ignored.
- Header-level quick create never creates an `Unscheduled` draft with `scheduled` status; it falls back to `draft` until assigned to a day.

## Executor Behavior
- Schedule input enforces a `min` value from current local time.
- Changes are applied only when datetime is valid and future.
- Empty values are allowed to clear schedule.

## Shared Utilities
`src/lib/organic/scheduling.ts` is the source of truth for:
- time label parsing/validation/normalization
- local datetime parsing
- future datetime checks
- current `datetime-local` minimum formatting
