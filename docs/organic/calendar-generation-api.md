# Organic Calendar Generation API

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

### Placement payload
- `placementId` (string)
- `schedule`: `{ dayId, scheduledAt, timeOfDay }`
- `platform`: `{ name, accountId }`
- `seed`: `{ trendId, source }`
- `content`: `{ type, format, titleTopic, objective, target, tone, cta, numSlides }`
- `creative`: `{ creativeIdea, assetIds, assetHints }`
- `copy`: `{ caption, hashtags: { high, medium, low } }`

### Example NDJSON
```json
{"type":"progress","completed":1,"total":6,"message":"Generating slot 1/6"}
{"type":"placement","placement":{"placementId":"seed-2026-01-26-trend-101","schedule":{"dayId":"2026-01-26","scheduledAt":"2026-01-26T17:00:00.000Z","timeOfDay":"morning"},"platform":{"name":"instagram","accountId":"ig_123"},"seed":{"trendId":"trend-101","source":"trend"},"content":{"type":"reel","format":"Reel","titleTopic":"Sustainable swaps","objective":"Educate","numSlides":1},"creative":{"creativeIdea":"Quick before/after montage","assetIds":["asset_991"]},"copy":{"caption":"3 easy swaps to cut waste this week…","hashtags":{"high":["#sustainable"],"medium":["#eco"],"low":["#brandname"]}}}}
{"type":"complete"}
```

## Backend expectations
- Validate `brandProfileId`, `trendId` ownership, and platform account access.
- Enforce max placements per request and rate limits.
- Respect `schedulePreset` for auto-fill and cadence rules.
- Use `placementId` as the stable merge key for updates/regenerations.
- If a placement conflicts (time overlap), return a placement with adjusted `scheduledAt` and a clarifying message in `creative.assetHints` or `content.tone`.
- Populate `creative.assetIds` with IDs from the creative library when a match exists.

## Client-side edge cases to handle BEFORE calling backend
1. No placements seeded (dragged or auto-sorted).
2. Missing `brandProfileId` or missing platform account IDs.
3. Placements outside the selected week or with invalid dates.
4. Duplicate `placementId` values (should be de-duped).
5. Unsupported platform in a seed (e.g. legacy platform not enabled).
6. Empty or invalid `trendId`.
7. Users drag the same trend onto the same day multiple times.
8. Seeded slots with missing `timeLabel` or invalid time format.
9. Newsletter included without a day assignment.
10. Regeneration of a slot without a seed trend.

## Backend-side edge cases to handle
- Seeds with no `accountId`: return `error` events per placement.
- Trend IDs not found: return `error` events per placement.
- Accounts not linked to brand: reject request with 403.
- Partial successes: stream `placement` for successes and `error` for failures.
- Conflicting placements: auto-adjust time and signal the adjustment.
- Missing creative assets: return `assetHints` instead of hard errors.
- Long-running jobs: emit periodic `progress` heartbeats.

## MVP cadence (Beta Launch)
- Monday/Wednesday/Friday → Instagram
- Tuesday/Thursday/Saturday → LinkedIn
- Newsletter scheduled once per week (default Sunday)
