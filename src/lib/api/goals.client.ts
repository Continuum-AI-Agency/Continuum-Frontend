import {
  type CreateGoalRequest,
  type CreateGoalResponse,
  createGoalRequestSchema,
  createGoalResponseSchema,
  type GoalCommandInput,
  type GoalCommandReceipt,
  type GoalEventsPage,
  goalCommandInputSchema,
  goalCommandReceiptSchema,
  goalCommandRequestSchema,
  goalEventsPageSchema,
  type ListGoalsResponse,
  listGoalsQuerySchema,
  listGoalsResponseSchema,
  type RegisterGoalEvidenceAttachmentRequest,
  type RegisterGoalEvidenceAttachmentResponse,
  registerGoalEvidenceAttachmentRequestSchema,
  registerGoalEvidenceAttachmentResponseSchema,
  type UpsertGoalCapabilityRouteRequest,
  type UpsertGoalCapabilityRouteResponse,
  upsertGoalCapabilityRouteRequestSchema,
  upsertGoalCapabilityRouteResponseSchema,
} from '@continuum/contracts';
import { http } from '@/lib/api/http';
import {
  type GoalSnapshotWithChatDeliveries,
  goalSnapshotWithChatDeliveriesSchema,
} from '@/lib/goals/chatDelivery';

const goalPath = (goalId: string): string => `/api/goals/${encodeURIComponent(goalId)}`;

export async function listGoals(brandId: string, signal?: AbortSignal): Promise<ListGoalsResponse> {
  const query = listGoalsQuerySchema.parse({ brandId });
  const params = new URLSearchParams({ brandId: query.brandId ?? brandId });
  return http.request({
    path: `/api/goals?${params.toString()}`,
    schema: listGoalsResponseSchema,
    signal,
  });
}

export async function createGoal(input: CreateGoalRequest): Promise<CreateGoalResponse> {
  return http.request({
    path: '/api/goals',
    method: 'POST',
    body: createGoalRequestSchema.parse(input),
    schema: createGoalResponseSchema,
  });
}

export async function getGoalSnapshot(
  goalId: string,
  signal?: AbortSignal,
): Promise<GoalSnapshotWithChatDeliveries> {
  return http.request({
    path: goalPath(goalId),
    schema: goalSnapshotWithChatDeliveriesSchema,
    signal,
  });
}

export async function getGoalEvents(input: {
  goalId: string;
  afterSeq?: number;
  signal?: AbortSignal;
}): Promise<GoalEventsPage> {
  const params = new URLSearchParams({
    afterSeq: String(input.afterSeq ?? 0),
  });
  return http.request({
    path: `${goalPath(input.goalId)}/events?${params.toString()}`,
    schema: goalEventsPageSchema,
    signal: input.signal,
  });
}

export async function sendGoalCommand(
  goalId: string,
  command: GoalCommandInput,
): Promise<GoalCommandReceipt> {
  const parsedCommand = goalCommandInputSchema.parse(command);
  return http.request({
    path: `${goalPath(goalId)}/commands`,
    method: 'POST',
    body: goalCommandRequestSchema.parse({ command: parsedCommand }),
    schema: goalCommandReceiptSchema,
  });
}

export async function upsertGoalCapabilityRoute(
  goalId: string,
  input: UpsertGoalCapabilityRouteRequest,
): Promise<UpsertGoalCapabilityRouteResponse> {
  return http.request({
    path: `${goalPath(goalId)}/capability-routes`,
    method: 'PUT',
    body: upsertGoalCapabilityRouteRequestSchema.parse(input),
    schema: upsertGoalCapabilityRouteResponseSchema,
  });
}

export async function registerGoalEvidenceAttachment(
  goalId: string,
  input: RegisterGoalEvidenceAttachmentRequest,
): Promise<RegisterGoalEvidenceAttachmentResponse> {
  return http.request({
    path: `${goalPath(goalId)}/evidence-attachments`,
    method: 'POST',
    body: registerGoalEvidenceAttachmentRequestSchema.parse(input),
    schema: registerGoalEvidenceAttachmentResponseSchema,
  });
}
