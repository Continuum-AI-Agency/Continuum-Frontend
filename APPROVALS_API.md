# Approvals API

> **Audience:** Frontend engineers integrating an approval / "action review" experience against the DCO analysis backend.
> **Status:** Reflects the implementation as of migration `021` (April 2026).

## 1. Overview

The DCO analysis backend continuously evaluates ad-account performance and proposes **actions** — pause an ad, scale a budget, raise an alert, etc. Every proposed action lands in a single queue (the `rule_actions` table) with status `PENDING`. A human reviewer then **approves** (which executes the action against the Meta Marketing API) or **rejects** it.

There is **one** approval queue, fed by two producers:

| Producer | What it is | How actions are tagged |
|----------|-----------|------------------------|
| **Rule engine** (`json-rules-engine`) | The legacy/automatic scheduler that evaluates parametric rules on a timer. | `rule_id` and `evaluation_id` are populated; `flow_run_id` is `null`. |
| **Flow runs** (DCO_rFlow visual graphs) | The newer graph runner emits actions via `POST /api/v2/actions/batch`. | `flow_run_id` is populated; `rule_id` and `evaluation_id` are `null`. |

From the frontend's point of view this distinction does not matter: **all actions share the same shape, the same queue, and the same approve/reject endpoints.** The only visible difference is which of `rule_name` / `flow_run_id` is present.

```
                 ┌──────────────────┐
  rule engine ──▶│                  │
                 │   rule_actions   │──▶  GET /api/rules/actions?status=PENDING   (review queue)
  flow runs   ──▶│   (PENDING ...)  │──▶  POST .../:id/approve  → executes on Meta
                 │                  │──▶  POST .../:id/reject   → marks rejected
                 └──────────────────┘
                          │
                          └──▶ every decision is mirrored to a Supabase audit log
```

---

## 2. Base URL, Auth & CORS

| | Value |
|---|---|
| **Production base URL** | `https://dco.api.trycontinuum.ai/api` |
| **Local dev base URL** | `http://localhost:3000/api` |
| **Approval routes prefix** | `/rules` → full path `…/api/rules/...` |
| **Authentication** | **None.** No token, cookie, or API key is required or checked today. |
| **CORS** | Fully open (`Access-Control-Allow-Origin: *`). Browser calls work from any origin. |
| **Content-Type** | `application/json` for all `POST` bodies. |

> ⚠️ **No identity layer exists server-side.** The backend does not know who the user is. The `actorId` you send on approve/reject is stored verbatim for audit purposes — **the frontend is responsible for passing the real logged-in user's id or email.** (The internal backoffice currently hardcodes `"user-dashboard"`; the main frontend should do better.)

---

## 3. The Action object

Every endpoint that returns actions returns objects with this shape. Fields come directly from the `rule_actions` table, plus two joined fields (`rule_name`, `evaluation_facts`).

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (UUID) | Action id. Use this in the approve/reject URLs. |
| `status` | string (enum) | See [status lifecycle](#4-status-lifecycle). |
| `action_type` | string (enum) | What to do. See [action types](#7-action-type-reference). |
| `scope_type` | string (enum) | `ACCOUNT` \| `CAMPAIGN` \| `ADSET` \| `AD` \| `GLOBAL`. |
| `scope_id` | string \| null | The Meta platform id of the target entity (campaign/adset/ad id). `null` for `GLOBAL`. |
| `action_payload` | object | Action-specific parameters. May be returned as an object or a JSON string — **always normalize/parse defensively.** E.g. for `SCALE_*`: `{ "budget_increase_pct": 20 }`. |
| `rule_name` | string \| null | Human-readable rule name. `null` for flow-emitted actions. |
| `evaluation_facts` | object \| null | Snapshot of the metrics that triggered the action (`roas`, `cpc`, `ctr`, `spend`, `impressions`, …). `null` for flow-emitted actions. Useful to show "why" in the UI. |
| `rule_id` | string (UUID) \| null | Source rule. `null` for flow-emitted actions. |
| `evaluation_id` | string (UUID) \| null | Source evaluation. `null` for flow-emitted actions. |
| `flow_run_id` | string (UUID) \| null | Source flow run. `null` for rule-engine actions. |
| `decision_note` | string \| null | Reviewer note (approve) or rejection reason (reject), or the system note that expired it. |
| `actor_id` | string \| null | Who decided. `"system"` when automated. |
| `decided_at` | string (ISO-8601) \| null | When approve/reject happened. |
| `executed_at` | string (ISO-8601) \| null | When the action ran against Meta. |
| `result` | object | Execution result from Meta (or `{ mode: "dry_run" }`). |
| `error` | string \| null | Failure message if execution failed. |
| `is_dry_run` | boolean | `true` if it was executed in simulation mode. |
| `created_at` | string (ISO-8601) | When the action was queued. |

### Example action object

```json
{
  "id": "8f3c2a10-5b6d-4e2f-9a1b-7c8d9e0f1a2b",
  "status": "PENDING",
  "action_type": "PAUSE_AD",
  "scope_type": "AD",
  "scope_id": "120218730884450618",
  "action_payload": { "reason": "ROAS below account average" },
  "rule_name": "Pause underperforming ads (ROAS < 70% of account avg)",
  "evaluation_facts": {
    "roas": 0.92,
    "account_avg_roas": 1.8,
    "spend": 240.5,
    "impressions": 18044,
    "ctr": 0.71,
    "cpc": 0.43
  },
  "rule_id": "1b2c3d4e-...",
  "evaluation_id": "9a8b7c6d-...",
  "flow_run_id": null,
  "decision_note": null,
  "actor_id": null,
  "decided_at": null,
  "executed_at": null,
  "result": { "mode": "queue", "note": "Action queued for execution" },
  "error": null,
  "is_dry_run": false,
  "created_at": "2026-05-23T09:14:22.531Z"
}
```

---

## 4. Status lifecycle

```
                ┌──────── approve ───────▶ EXECUTED   (Meta call succeeded)
                │
   PENDING ─────┼──────── approve ───────▶ FAILED     (Meta call threw; see `error`)
   (in queue)   │
                ├──────── reject ────────▶ REJECTED
                │
                └── new analysis cycle ──▶ EXPIRED    (auto, no user action)
```

| Status | Meaning |
|--------|---------|
| `PENDING` | Awaiting a decision. **This is the only status the review queue should act on.** |
| `EXECUTED` | Approved and successfully applied on Meta (or simulated, if dry-run). |
| `FAILED` | Approved, but the Meta API call (or executor) threw. See `error`. |
| `REJECTED` | A reviewer declined it. `decision_note` holds the reason. |
| `EXPIRED` | Auto-retired by the system (see note below). Never the result of a user action. |
| `SKIPPED` / `APPROVED` | Defined in the DB enum but **not produced by the current code paths.** Treat as inert/legacy. |

> ⏳ **PENDING actions are not permanent.** Each time the rule engine re-runs, it **expires** the previous `PENDING` actions for the same rule+scope (and runs a cross-rule de-dup by priority, and a "stale > 5 min not renewed" sweep). Practical consequences for the UI:
> - Poll/refresh the queue regularly; don't assume a `PENDING` action you fetched 20 minutes ago is still actionable.
> - A reviewer can still approve an action that has since become `EXPIRED` (the executor only blocks re-execution of `EXECUTED` actions). Consider re-fetching an action's status right before showing the approve confirmation, or simply handle a possible execution on a stale row gracefully.

---

## 5. Endpoints

### 5.1 List actions (the review queue)

```
GET /api/rules/actions
```

**Query parameters**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `status` | string | _(none = all)_ | Filter by status. For the review queue use `status=PENDING`. |
| `limit` | integer | `50` | Page size. Capped at `200`. |
| `offset` | integer | `0` | Pagination offset. |

**Response `200`**

```json
{
  "data": [ /* array of Action objects (see §3) */ ],
  "total": 137,
  "limit": 50,
  "offset": 0
}
```

- `data` is ordered by `created_at DESC` (newest first).
- `total` is the count for the given `status` filter (use it to drive pagination).

**Example**

```bash
curl "https://dco.api.trycontinuum.ai/api/rules/actions?status=PENDING&limit=20&offset=0"
```

---

### 5.2 Approve an action  ⚠️ *executes immediately*

```
POST /api/rules/actions/:actionId/approve
```

Approving an action **synchronously runs it against the Meta Marketing API** (pause/scale/etc.) unless dry-run mode is on (see §6). Expect this call to take a few seconds for live Meta actions.

**Path params**

| Param | Description |
|-------|-------------|
| `actionId` | The action `id` (UUID). |

**Request body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `actorId` | string | recommended | Logged-in user id/email. Stored for audit. Defaults to `"system"` if omitted. |
| `note` | string | optional | Free-text approval note. Defaults to `"Approved via API"`. |

```json
{ "actorId": "jane@acme.com", "note": "Confirmed with media team" }
```

**Responses**

| Status | When | Body |
|--------|------|------|
| `200` | Executed successfully | The **updated Action object** (`status: "EXECUTED"`, populated `result`, `executed_at`, `actor_id`, `decided_at`, `is_dry_run`). |
| `200` | Action was already executed | `{ "status": "ALREADY_EXECUTED", "action": { ...the existing action } }` |
| `500` | Execution failed **or** action id not found | `{ "error": "<message>" }` |

> 🛑 **Important:** a failed Meta execution returns **HTTP 500**, *and* the action row is updated to `status: "FAILED"` with the error stored. So a 500 here is an expected business outcome, not necessarily a server bug — surface `error` to the reviewer and refresh the row. An unknown/non-existent `actionId` also returns 500 (not 404) with `"Action <id> not found"`.

**Example**

```bash
curl -X POST \
  "https://dco.api.trycontinuum.ai/api/rules/actions/8f3c2a10-5b6d-4e2f-9a1b-7c8d9e0f1a2b/approve" \
  -H "Content-Type: application/json" \
  -d '{ "actorId": "jane@acme.com", "note": "Confirmed with media team" }'
```

---

### 5.3 Reject an action

```
POST /api/rules/actions/:actionId/reject
```

Marks the action `REJECTED`. **No Meta API call is made** — this is a local state change only.

**Request body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `reason` | string | recommended | Why it was rejected. Stored in both `error` and `decision_note`. Defaults to `"User rejected"`. |
| `actorId` | string | recommended | Logged-in user id/email. Defaults to `"system"`. |

```json
{ "reason": "Strategy change — keeping this ad live", "actorId": "jane@acme.com" }
```

**Responses**

| Status | When | Body |
|--------|------|------|
| `200` | Rejected | The **updated Action object** (`status: "REJECTED"`). |
| `500` | Action id not found | `{ "error": "Action not found" }` |

**Example**

```bash
curl -X POST \
  "https://dco.api.trycontinuum.ai/api/rules/actions/8f3c2a10-.../reject" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Strategy change", "actorId": "jane@acme.com" }'
```

---

### 5.4 (Related) Queue / engine health

```
GET /api/rules/health
```

Optional, useful for a dashboard header ("engine last ran X min ago", counts). Returns scheduler state, 24h evaluation stats, active rule counts, active targets per scope, and a per-rule breakdown. Not required to build the approval flow.

---

## 6. Dry-run mode (affects what "approve" does)

A global setting controls whether approvals actually hit Meta or are **simulated**.

- **Read it:** `GET /api/settings/rules_dry_run_mode` → `{ "key": "rules_dry_run_mode", "value": "true" | "false" }` (value is a **string**).
- **Toggle it:** `PATCH /api/settings` with body `{ "rules_dry_run_mode": "true" }` (or `"false"`).

When dry-run is `"true"`, approving an action marks it `EXECUTED` with `result.mode = "dry_run"` and `is_dry_run: true`, but performs **no** real Meta change. Recommended UX: read this setting on load and show a clear "Simulation mode" banner so reviewers know approvals are not live.

---

## 7. Action type reference

`action_type` tells the UI what the action will do (use it for icons/labels), and matters because **the executor only supports a subset** — approving an unsupported type will end in `FAILED`.

| `action_type` | Meaning | Executable on approve today? |
|---------------|---------|------------------------------|
| `PAUSE_AD` | Pause an ad / creative | ✅ Yes |
| `PAUSE_ADSET` | Pause an ad set | ✅ Yes |
| `PAUSE_CAMPAIGN` | Pause a campaign | ✅ Yes |
| `SCALE_ADSET` | Increase ad set daily budget by `action_payload.budget_increase_pct` (default 20%) | ✅ Yes |
| `SCALE_CAMPAIGN` | Increase campaign budget (CBO daily/lifetime) by `budget_increase_pct` | ✅ Yes |
| `ALERT_ACCOUNT` | Notification only, no Meta change | ✅ Yes (no-op acknowledge) |
| `NOOP` | No operation (test/placeholder) | ✅ Yes (no-op) |
| `SCALE_AD` | Ad-level scaling | ❌ Throws "not yet supported" → `FAILED` |
| `ACTIVATE_AD` / `ACTIVATE_ADSET` / `ACTIVATE_CAMPAIGN` | Re-activate entity | ❌ Not handled by executor → `FAILED` |
| `ALERT_CAMPAIGN` | Campaign-level alert | ❌ Not handled by executor → `FAILED` |
| `SWAP_CREATIVE` | Replace creative | ❌ Not handled by executor → `FAILED` |

> The `ACTIVATE_*`, `ALERT_CAMPAIGN`, and `SWAP_CREATIVE` types are **accepted into the queue** by the flow-runs producer but are **not yet implemented in the executor**. If you display these, consider disabling the approve button or warning the reviewer until backend support lands.

---

## 8. Recommended frontend flow

1. **On load:** `GET /api/settings/rules_dry_run_mode` → show a "Simulation mode" banner if `"true"`.
2. **Review queue:** `GET /api/rules/actions?status=PENDING&limit=…&offset=…`. Render each item using `action_type` (icon/label), `scope_type` + `scope_id` (target), `rule_name` (why), and `evaluation_facts` (the metrics that triggered it). Drive pagination from `total`.
3. **Refresh:** Re-poll the queue periodically (e.g. every 30–60s) since `PENDING` actions auto-expire across analysis cycles.
4. **Approve:** `POST .../:id/approve` with `{ actorId: <current user>, note }`. Show a spinner (live Meta calls take a few seconds).
   - `200` with an Action → remove from queue, show its new status (`EXECUTED`).
   - `200` with `{ status: "ALREADY_EXECUTED" }` → it was already done; remove and refresh.
   - `500` → read `error`, show it, and re-fetch the row (it may now be `FAILED`).
5. **Reject:** collect a `reason` from the user, `POST .../:id/reject` with `{ actorId, reason }`, then remove from the queue.
6. **Optimistic UI:** the internal backoffice removes the card immediately and rolls back on error — a reasonable pattern, but given the auto-expiry, re-fetching the queue after each decision keeps it honest.

---

## 9. Audit trail (read-only, FYI)

Every approve/reject/execution (and every auto-expiry that goes through the decision path) is mirrored to a **Supabase** audit log (`rule_action_logs`) via an edge function. Each log row records the action, the resolved Meta hierarchy (`meta_account_id` / `meta_campaign_id` / `meta_adset_id` / `meta_ad_id`), `brand_id`, `is_automated`, `actor_id`, `decision_note`, `result`, `error`, and `is_dry_run`.

This log is **not** exposed through this REST API. If the frontend needs a decision history view, it should query Supabase directly (out of scope for this document — coordinate with the backend team for the table schema and access keys).

---

## 10. Quick reference (TypeScript)

```ts
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

export type ActionStatus =
  | "PENDING" | "EXECUTED" | "FAILED" | "REJECTED" | "EXPIRED";

export interface RuleAction {
  id: string;
  status: ActionStatus;
  action_type: string;
  scope_type: "ACCOUNT" | "CAMPAIGN" | "ADSET" | "AD" | "GLOBAL";
  scope_id: string | null;
  action_payload: Record<string, unknown>; // may arrive as a JSON string — parse defensively
  rule_name?: string | null;
  evaluation_facts?: Record<string, number> | null;
  flow_run_id?: string | null;
  decision_note?: string | null;
  actor_id?: string | null;
  decided_at?: string | null;
  executed_at?: string | null;
  result?: Record<string, unknown>;
  error?: string | null;
  is_dry_run?: boolean;
  created_at: string;
}

export async function listPending(limit = 50, offset = 0) {
  const r = await fetch(`${API}/rules/actions?status=PENDING&limit=${limit}&offset=${offset}`);
  return r.json() as Promise<{ data: RuleAction[]; total: number; limit: number; offset: number }>;
}

export async function approve(id: string, actorId: string, note?: string) {
  const r = await fetch(`${API}/rules/actions/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorId, note }),
  });
  if (!r.ok) throw new Error((await r.json()).error); // 500 => execution failed; row is now FAILED
  return r.json() as Promise<RuleAction | { status: "ALREADY_EXECUTED"; action: RuleAction }>;
}

export async function reject(id: string, actorId: string, reason: string) {
  const r = await fetch(`${API}/rules/actions/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorId, reason }),
  });
  if (!r.ok) throw new Error((await r.json()).error);
  return r.json() as Promise<RuleAction>;
}
```

---

## Appendix — Endpoint summary

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/rules/actions?status=PENDING&limit=&offset=` | Fetch the review queue |
| `POST` | `/api/rules/actions/:id/approve` | Approve → **execute on Meta** (or simulate if dry-run) |
| `POST` | `/api/rules/actions/:id/reject` | Reject (local state change only) |
| `GET` | `/api/settings/rules_dry_run_mode` | Read simulation-mode flag |
| `PATCH` | `/api/settings` | Toggle simulation-mode flag |
| `GET` | `/api/rules/health` | (Optional) engine/queue health for dashboards |



Old reccomendations are discarded whe new information suggests a new reccomendation, leading to us needing to update our sync db that our proposed actions have, to be labeled as "expired"
