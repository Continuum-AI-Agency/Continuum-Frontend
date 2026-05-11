# Agent Reference Context Contract

This contract supports user-visible `@Label` mentions while sending resolved app entity IDs to the agent runtime.

## Principle

The message text remains human-readable. Entity IDs are carried separately in typed metadata.

```json
{
  "query": "Compare @Spring Sale to @Prospecting Women",
  "context": {
    "references": [
      {
        "id": "238000111",
        "type": "campaign",
        "label": "Spring Sale",
        "source": "jaina",
        "metadata": {
          "campaignId": "238000111",
          "adAccountId": "act_123",
          "status": "ACTIVE"
        }
      },
      {
        "id": "120000222",
        "type": "adset",
        "label": "Prospecting Women",
        "source": "jaina",
        "metadata": {
          "adsetId": "120000222",
          "campaignId": "238000111",
          "campaignName": "Spring Sale",
          "adAccountId": "act_123",
          "status": "ACTIVE"
        }
      }
    ]
  },
  "message_metadata": {
    "references": [
      {
        "id": "238000111",
        "type": "campaign",
        "label": "Spring Sale",
        "source": "jaina"
      },
      {
        "id": "120000222",
        "type": "adset",
        "label": "Prospecting Women",
        "source": "jaina",
        "metadata": {
          "adsetId": "120000222",
          "campaignId": "238000111",
          "campaignName": "Spring Sale",
          "adAccountId": "act_123"
        }
      }
    ]
  }
}
```

`message_metadata.references` should persist the same references attached to the user message. If both fields are present, backend can treat `context.references` as runtime grounding and `message_metadata.references` as the persisted copy.

## Reference Shape

```ts
type AgentMentionReference = {
  id: string;
  type: "trend" | "event" | "question" | "draft" | "campaign" | "adset";
  label: string;
  source: "organic" | "jaina";
  metadata?: Record<string, unknown>;
};
```

## Jaina Request

The frontend sends references on `/api/agents/jaina/chat/stream`:

```json
{
  "query": "What changed in @Spring Sale?",
  "include_thoughts": true,
  "message_metadata": {
    "references": [
      {
        "id": "238000111",
        "type": "campaign",
        "label": "Spring Sale",
        "source": "jaina",
        "metadata": {
          "campaignId": "238000111",
          "adAccountId": "act_123"
        }
      }
    ]
  },
  "context": {
    "brandId": "brand_123",
    "adAccountId": "act_123",
    "sessionId": "session_123",
    "references": [
      {
        "id": "238000111",
        "type": "campaign",
        "label": "Spring Sale",
        "source": "jaina",
        "metadata": {
          "campaignId": "238000111",
          "adAccountId": "act_123"
        }
      }
    ]
  }
}
```

Backend should:

1. Validate `context.references` as an array of reference objects.
2. Persist the same array under the saved user message metadata.
3. Convert references into compact grounding context before planner/tool selection.
4. Prefer IDs from references over model-parsed labels.

Suggested grounding block:

```txt
Explicit app references selected by the user:
- campaign: "Spring Sale" campaign_id=238000111 ad_account_id=act_123 status=ACTIVE
- adset: "Prospecting Women" adset_id=120000222 campaign_id=238000111 campaign="Spring Sale"
```

## Organic Agent Request

The frontend sends references on `/api/organic/agent/chat`:

```json
{
  "brandId": "brand_123",
  "sessionId": "session_123",
  "messages": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "Build posts from @Summer Skin Prep and @Draft A",
      "metadata": {
        "references": [
          {
            "id": "trend_123",
            "type": "trend",
            "label": "Summer Skin Prep",
            "source": "organic"
          },
          {
            "id": "draft_123",
            "type": "draft",
            "label": "Draft A",
            "source": "organic"
          }
        ]
      }
    }
  ],
  "references": [
    {
      "id": "trend_123",
      "type": "trend",
      "label": "Summer Skin Prep",
      "source": "organic",
      "metadata": {
        "generationId": "gen_123",
        "weekStart": "2026-05-04",
        "isSelected": true
      }
    },
    {
      "id": "draft_123",
      "type": "draft",
      "label": "Draft A",
      "source": "organic",
      "metadata": {
        "draftId": "draft_123",
        "status": "scheduled",
        "dayId": "2026-05-12",
        "timeLabel": "9:00 AM",
        "platforms": ["instagram"]
      }
    }
  ],
  "message_metadata": {
    "references": [
      {
        "id": "trend_123",
        "type": "trend",
        "label": "Summer Skin Prep",
        "source": "organic"
      },
      {
        "id": "draft_123",
        "type": "draft",
        "label": "Draft A",
        "source": "organic"
      }
    ]
  },
  "context": {
    "references": [
      {
        "id": "trend_123",
        "type": "trend",
        "label": "Summer Skin Prep",
        "source": "organic"
      },
      {
        "id": "draft_123",
        "type": "draft",
        "label": "Draft A",
        "source": "organic"
      }
    ]
  }
}
```

Backend should accept any of these equivalent locations during rollout:

- `references`
- `context.references`
- latest user message `metadata.references`
- `message_metadata.references`

After rollout, prefer `context.references` for runtime and latest user message `metadata.references` for persistence.

## Persistence

Conversation history responses should include user message metadata:

```json
{
  "id": "msg_1",
  "role": "user",
  "content": "Build posts from @Summer Skin Prep",
  "metadata": {
    "references": [
      {
        "id": "trend_123",
        "type": "trend",
        "label": "Summer Skin Prep",
        "source": "organic"
      }
    ]
  }
}
```

The frontend hydrates this metadata without changing visible message content.

## Runtime Rules

- Never require the model to infer IDs from visible `@Label` text.
- Do not append IDs to the user query.
- If a referenced entity is unauthorized or missing, return a structured warning and continue with the visible text.
- For Jaina adsets, `metadata.campaignId` is required.
- For Organic drafts, `metadata.draftId` should be present even when `id` is also the draft ID.
