<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Continuum. Client-side tracking is initialized via `instrumentation-client.ts` (Next.js 15.3+ pattern) with exception capture enabled and a reverse proxy configured through `/ingest`. A shared server-side PostHog client (`src/lib/posthog-server.ts`) is used across API routes and Server Actions. User identification is performed at login (password and magic link flows) and at invite acceptance. 14 events are instrumented across 10 files spanning auth, onboarding, settings, integrations, AI Studio, organic content, paid media, and the Jaina AI agent.

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User successfully completed signup | `src/app/(auth)/signup/page.tsx` |
| `user_logged_in` | User logged in (password or magic link) | `src/app/(auth)/login/page.tsx` |
| `onboarding_completed` | User launched their brand profile | `src/app/onboarding/actions.ts` |
| `brand_profile_created` | User created a new brand profile | `src/app/(post-auth)/settings/actions.ts` |
| `brand_profile_deleted` | User deleted a brand profile | `src/app/(post-auth)/settings/actions.ts` |
| `team_member_invited` | User invited a team member to a brand | `src/app/(post-auth)/settings/actions.ts` |
| `invite_accepted` | User accepted a brand invite | `src/app/invite/callback/page.tsx` |
| `integration_connected` | OAuth platform integration succeeded | `src/app/(post-auth)/integrations/callback/page.tsx` |
| `integration_connection_failed` | OAuth platform integration failed | `src/app/(post-auth)/integrations/callback/page.tsx` |
| `ai_studio_generation_requested` | User submitted an AI Studio generation request | `src/app/api/ai-studio/generate/route.ts` |
| `organic_calendar_generated` | User triggered organic content calendar generation | `src/app/api/organic/generate-calendar/route.ts` |
| `jaina_chat_message_sent` | User sent a message to the Jaina AI agent | `src/app/api/agents/jaina/chat/stream/route.ts` |
| `campaign_index_created` | User created a paid media campaign index | `src/app/api/paid-media/campaign-indexes/route.ts` |
| `platform_connection_synced` | User synced integration accounts during onboarding | `src/app/onboarding/actions.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard**: [Analytics basics](https://us.posthog.com/project/382935/dashboard/1470008)
- **Signup to Onboarding Completion Funnel**: [IsHeGkpv](https://us.posthog.com/project/382935/insights/IsHeGkpv)
- **Daily New Signups**: [OSJdleaY](https://us.posthog.com/project/382935/insights/OSJdleaY)
- **AI Studio Generation Requests Over Time**: [jJnOTZEQ](https://us.posthog.com/project/382935/insights/jJnOTZEQ)
- **Integration Connection Success vs Failure**: [Y21AcCin](https://us.posthog.com/project/382935/insights/Y21AcCin)
- **Team Invites Sent Weekly**: [wQO0loIo](https://us.posthog.com/project/382935/insights/wQO0loIo)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
