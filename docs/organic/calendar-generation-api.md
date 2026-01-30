# Organic Calendar Generation API (Refined)

## Goal
Stream placement-ready organic content for a specific week using a calendar seed map. Each seed contains a trend/question ID plus a timestamp (day + time), platform, and optional guidance. The backend responds with NDJSON events that fill the calendar with generated copy, hashtags, and post-type metadata.

## Endpoint (frontend proxy)
`POST /api/organic/generate-calendar` (NDJSON stream)

Upstream target (service): `POST {ORGANIC_SERVICE_BASE_URL}/generate-calendar`

## Request (client → API)

### Top-level fields
- `brandProfileId` (string, required)
- `weekStart` (string, required) — YYYY-MM-DD of the week’s Monday in brand timezone
- `timezone` (string, required) — IANA tz (e.g. `America/Los_Angeles`)
- `platformAccountIds` (object, optional) — map of `{ platform: accountId }`
- `placements` (array, required) — seed map for the calendar
- `options` (object, optional)

### Placement seed object
- `placementId` (string, required) — stable client ID used for merge/regeneration
- `trendId` (string, required) — trend/question/event identifier
- `dayId` (string, required) — YYYY-MM-DD
- `scheduledAt` (string, required) — ISO timestamp for the slot (use local → ISO)
- `timeLabel` (string, optional) — UI label (e.g. `9:00 AM`) for reconciliation
- `platform` (`instagram` | `linkedin` | `facebook` | `tiktok` | `youtube`, required)
- `accountId` (string, optional) — platform account id for posting
- `seedSource` (`trend` | `question` | `event` | `manual`, optional)
- `desiredFormat` (string, optional) — `reel` | `carousel` | `story` | `post` | `newsletter`
- `metadata` (object, optional) — extra hints (creative library tags, priority, etc.)

### Options
- `schedulePreset` (`beta-launch`, optional)
- `includeNewsletter` (boolean, optional)
- `newsletterDayId` (string, optional)
- `guidancePrompt` (string, optional)
- `language` (string, optional) — Preferred language for generation (e.g., `en-US`, `es`)
- `preferredPlatforms` (array of platforms, optional)

### Example request (JSON)
```json
{
  "brandProfileId": "brand_123",
  "weekStart": "2026-01-26",
  "timezone": "America/Los_Angeles",
  "platformAccountIds": {
    "instagram": "ig_123",
    "linkedin": "li_456"
  },
  "placements": [
    {
      "placementId": "seed-2026-01-26-trend-101",
      "trendId": "trend-101",
      "dayId": "2026-01-26",
      "scheduledAt": "2026-01-26T17:00:00.000Z",
      "timeLabel": "9:00 AM",
      "platform": "instagram",
      "accountId": "ig_123",
      "seedSource": "trend",
      "desiredFormat": "reel"
    }
  ],
  "options": {
    "schedulePreset": "beta-launch",
    "includeNewsletter": true,
    "language": "en-US",
    "guidancePrompt": "Highlight the sustainability angle this week.",
    "preferredPlatforms": ["instagram", "linkedin"]
  }
}
```

## Response (NDJSON stream)
Each line is a JSON object with a `type` field.

### Event types
- `progress`
- `placement`
- `error`
- `complete`

### Event: progress
- `completed` (number)
- `total` (number)
- `stage` (`analyzing` | `drafting` | `matching` | `optimizing` | `finalizing`, optional)
- `message` (string, optional)

### Event: placement
- `placementId` (string)
- `schedule`: `{ dayId, scheduledAt, timeOfDay, adjusted }`
  - `adjusted` (boolean, optional): Set to `true` if the backend shifted the time to avoid conflicts.
- `platform`: `{ name, accountId }`
- `seed`: `{ trendId, source }`
- `content`: `{ type, format, titleTopic, objective, target, tone, cta, numSlides }`
- `creative`: `{ creativeIdea, assetIds, assetHints }`
  - `assetHints` (array of objects, optional): `[{ "role": "string", "suggestion": "string" }]`
- `copy`: `{ caption, hashtags: { high, medium, low } }`

### Event: error
- `code` (string, optional): Structured error code (e.g., `ACCOUNT_DISCONNECTED`, `AUTH_FAILED`).
- `message` (string): Human-readable error.
- `placementId` (string, optional): The specific slot that failed.

### Example NDJSON
```json
{"type":"progress","completed":1,"total":6,"stage":"drafting","message":"Generating slot 1/6"}
{"type":"placement","placement":{"placementId":"seed-2026-01-26-trend-101","schedule":{"dayId":"2026-01-26","scheduledAt":"2026-01-26T17:00:00.000Z","timeOfDay":"morning","adjusted":false},"platform":{"name":"instagram","accountId":"ig_123"},"seed":{"trendId":"trend-101","source":"trend"},"content":{"type":"reel","format":"Reel","titleTopic":"Sustainable swaps","objective":"Educate","numSlides":1},"creative":{"creativeIdea":"Quick before/after montage","assetIds":["asset_991"],"assetHints":[{"role":"visual","suggestion":"Use green overlays"}]},"copy":{"caption":"3 easy swaps to cut waste this week…","hashtags":{"high":["#sustainable"],"medium":["#eco"],"low":["#brandname"]}}}}
{"type":"complete"}
```

## Backend expectations
- Validate `brandProfileId`, `trendId` ownership, and platform account access.
- Enforce max placements per request and rate limits.
- Respect `schedulePreset` for auto-fill and cadence rules.
- Use `placementId` as the stable merge key for updates/regenerations.
- **Conflict Handling**: If a placement conflicts (time overlap), return a placement with adjusted `scheduledAt` and set `schedule.adjusted: true`.
- Populate `creative.assetIds` with IDs from the creative library when a match exists.
- **Progress Reporting**: Emit `progress` events with meaningful `stage` values.

## Client-side edge cases to handle BEFORE calling backend
1. No placements seeded (dragged or auto-sorted).
2. Missing `brandProfileId` or missing platform account IDs.
3. Placements outside the selected week or with invalid dates.
4. Duplicate `placementId` values (should be de-duped).
5. Unsupported platform in a seed.
6. Empty or invalid `trendId`.
7. Newsletter included without a day assignment.

## Backend-side edge cases to handle
- Seeds with no `accountId`: return `error` events per placement with code `MISSING_ACCOUNT`.
- Trend IDs not found: return `error` events per placement with code `TREND_NOT_FOUND`.
- Accounts not linked to brand: reject request with 403.
- Partial successes: stream `placement` for successes and `error` for failures.
- Conflicting placements: auto-adjust time and set `adjusted: true`.
- Long-running jobs: emit periodic `progress` heartbeats.