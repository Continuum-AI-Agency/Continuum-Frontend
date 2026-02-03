# Organic Calendar Generation API (Stateful Batch Generation)

## Overview
The `generate-calendar` endpoint supports **Stateful Batch Generation**. This means:
1.  **Gap Filling**: It will automatically fill empty schedule slots with trend-based content according to strict platform rules.
2.  **Editorial Orchestration**: It ensures no two posts in a batch share the same topic or angle.

---

## Endpoint (frontend proxy)
`POST /api/organic/generate-calendar` (NDJSON stream)

Upstream target (service): `POST {ORGANIC_SERVICE_BASE_URL}/generate-calendar`

## Request (client → API)

### Top-level fields
- `brandProfileId` (string, required)
- `weekStart` (string, required) — YYYY-MM-DD of the week’s Monday in brand timezone
- `timezone` (string, required) — IANA tz (e.g. `America/Los_Angeles`)
- `platformAccountIds` (object, optional) — map of `{ platform: accountId }`
- `placements` (array, required) — seed map for the calendar. **If you send an empty array, the system will FULLY auto-generate the week.**
- `options` (object, optional)

### Placement seed object
- `placementId` (string, required) — stable client ID used for merge/regeneration
- `trendId` (string, optional) — trend/question/event identifier. Optional for manual seeds.
- `dayId` (string, required) — YYYY-MM-DD
- `scheduledAt` (string, required) — ISO timestamp for the slot
- `platform` (`instagram` | `linkedin` | `facebook` | `tiktok` | `youtube`, required)
- `accountId` (string, optional) — platform account id for posting
- `seedSource` (`trend` | `question` | `event` | `manual`, optional)
- `desiredFormat` (string, optional) — `reel` | `carousel` | `story` | `post` | `newsletter`

### Options
- `schedulePreset` (`beta-launch`, optional)
- `includeNewsletter` (boolean, optional)
- `guidancePrompt` (string, optional)
- `language` (string, optional)

---

## Response (NDJSON stream)

### Event: progress
Used for UI loading bars. Includes stages for gap filling and editorial planning.
- `completed` (number)
- `total` (number)
- `stage` (`analyzing` | `optimizing` | `drafting` | `matching` | `finalizing`, optional)
- `message` (string, optional)

### Event: placement
Emitted when a single post is fully generated.
- `placementId` (string)
- `schedule`: `{ dayId, scheduledAt, timeOfDay, adjusted }`
- `platform`: `{ name, accountId }`
- `seed`: `{ trendId, source }`
- `content`: `{ type, format, titleTopic, objective, target, tone, cta, numSlides }`
  - `titleTopic`: Assigned by the Editorial Agent to ensure uniqueness.
- `creative`: `{ creativeIdea, assetIds, assetHints }`
- `copy`: `{ caption, hashtags: { high, medium, low } }`

---

## Behavior Changes

### 1. Automatic Gap Filling
The system enforces the following schedule if slots are missing:

| Day | Platform | Format |
| :--- | :--- | :--- |
| **Mon, Wed, Fri** | Instagram | Reel / Carousel / Static |
| **Tue, Thu, Sat** | LinkedIn | Text / Article |

### 2. Editorial "No-Duplication" Guarantee
The system runs an **Editorial Board** step before generation:
- It analyzes all requests (manual + filled) together.
- It assigns distinct angles to ensure no two posts in the same week share the same topic or angle.
- **Example**: If 3 posts about "AI" are requested, the editor will differentiate them (e.g., Financial Impact vs. Lifestyle vs. Technical).
