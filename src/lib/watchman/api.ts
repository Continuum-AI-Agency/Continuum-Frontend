'use client';

import {
  WATCHMAN_CONVERSATION_ROUTE,
  WATCHMAN_DASHBOARD_ROUTE,
  WATCHMAN_INTERACTION_ROUTE,
  WATCHMAN_MANAGE_ROUTE,
  WATCHMAN_SETUP_ROUTE,
  type WatchmanConversationView,
  type WatchmanDashboard,
  type WatchmanInteractionRequest,
  type WatchmanManageInput,
  type WatchmanSetupView,
  type WatchmanUiMessage,
  watchmanConversationViewSchema,
  watchmanDashboardSchema,
  watchmanInteractionRequestSchema,
  watchmanPersonTaskViewSchema,
  watchmanProposalViewSchema,
  watchmanReportViewSchema,
  watchmanSetupViewSchema,
  watchmanStatusViewSchema,
  watchmanUiMessageSchema,
  watchmanWakeViewSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import { request } from '@/lib/api/http';

// A brand admin's Watchman actions (plan 074 step 5). The Backend runs the same watchman_manage
// handler the MCP does, so the page gets the same admin gate and validation. Anyone else: 403.

export async function manageWatchman<T>(
  brandId: string,
  input: WatchmanManageInput,
  result: z.ZodType<T>,
): Promise<T> {
  return request({
    path: WATCHMAN_MANAGE_ROUTE,
    method: 'POST',
    body: { brandId, input },
    schema: z.object({ status: z.literal('ok'), result }).transform((out) => out.result),
  });
}

export const watchmanReads = {
  setup: (brandId: string, requestId: string) =>
    request<WatchmanSetupView>({
      path: `${WATCHMAN_SETUP_ROUTE}?${new URLSearchParams({ brandId, requestId })}`,
      schema: watchmanSetupViewSchema.refine(
        (view) =>
          view.setup.brand_id === brandId &&
          view.setup.request_id === requestId &&
          view.input.request_id === requestId,
        'Setup response identity mismatch',
      ),
    }),
  dashboard: (brandId: string) =>
    request<WatchmanDashboard>({
      path: `${WATCHMAN_DASHBOARD_ROUTE}?${new URLSearchParams({ brandId })}`,
      schema: watchmanDashboardSchema.refine(
        (view) => view.brand_id === brandId,
        'Dashboard response brand mismatch',
      ),
    }),
  conversation: (brandId: string, watchmanId: string, conversationId: string) =>
    request<WatchmanConversationView>({
      path: `${WATCHMAN_CONVERSATION_ROUTE}?${new URLSearchParams({ brandId, watchmanId, conversationId })}`,
      schema: watchmanConversationViewSchema.refine(
        (view) =>
          view.watchman_id === watchmanId &&
          view.conversation_id === conversationId &&
          view.events.every(
            (event) =>
              event.brand_id === brandId &&
              event.watchman_id === watchmanId &&
              event.conversation_id === conversationId,
          ) &&
          view.messages.every(
            (message) =>
              message.watchman_id === watchmanId && message.conversation_id === conversationId,
          ),
        'Conversation response identity mismatch',
      ),
    }),
  status: (brandId: string) =>
    manageWatchman(
      brandId,
      { action: 'status' },
      z.object({ watchmen: z.array(watchmanStatusViewSchema) }),
    ),
  tasks: (brandId: string, watchmanId: string) =>
    manageWatchman(
      brandId,
      { action: 'task_list', watchman_id: watchmanId },
      z.object({ tasks: z.array(watchmanPersonTaskViewSchema) }),
    ),
  reports: (brandId: string, watchmanId: string) =>
    manageWatchman(
      brandId,
      { action: 'report_list', watchman_id: watchmanId },
      z.object({ reports: z.array(watchmanReportViewSchema) }),
    ),
  proposals: (brandId: string, watchmanId: string) =>
    manageWatchman(
      brandId,
      { action: 'proposal_list', watchman_id: watchmanId },
      z.object({ proposals: z.array(watchmanProposalViewSchema) }),
    ),
  wakes: (brandId: string, watchmanId: string) =>
    manageWatchman(
      brandId,
      { action: 'wake_list', watchman_id: watchmanId },
      z.object({ wakes: z.array(watchmanWakeViewSchema) }),
    ),
};

export const interactWatchman = (input: WatchmanInteractionRequest) =>
  request<WatchmanUiMessage>({
    path: WATCHMAN_INTERACTION_ROUTE,
    method: 'POST',
    body: watchmanInteractionRequestSchema.parse(input),
    schema: watchmanUiMessageSchema.refine(
      (message) =>
        message.watchman_id === input.watchman_id &&
        message.conversation_id === input.conversation_id,
      'Interaction response identity mismatch',
    ),
  });

export const watchmanQueryKeys = {
  all: (brandId: string) => ['watchman', brandId] as const,
  part: (brandId: string, part: string, watchmanId?: string) =>
    ['watchman', brandId, part, watchmanId ?? null] as const,
};
