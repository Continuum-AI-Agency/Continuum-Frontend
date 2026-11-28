import { z } from 'zod';
import { watchmanReportNarrativeIssue } from '../watchman/report-narrative';
import { watchmanExecutionReceiptSchema, watchmanRoleSchema } from '../watchman/teammates';
import { goalExecutionRefSchema } from './execution';

const id = z.string().trim().min(1).max(240);
const text = z.string().trim().min(1);

/** A completed operation is an observed receipt, never model prose or a queued job. */
export const watchmanDeliveryDataSchema = z
  .object({
    objective: text.max(4_000),
    role: watchmanRoleSchema,
    execution: goalExecutionRefSchema,
    delivery: z
      .object({
        summary: text.max(2_000),
        markdown: text.max(12_000).optional(),
        proseStatus: z.literal('unverified'),
      })
      .strict(),
    operationReceipts: z.array(watchmanExecutionReceiptSchema).min(1).max(50),
    evidenceIds: z.array(id).max(100),
    openItems: z
      .object({
        limitations: z.array(text.max(1_000)).max(20),
        followUps: z.array(text.max(1_000)).max(20),
      })
      .strict(),
  })
  .strict()
  .superRefine((data, context) => {
    const seen = new Set<string>();
    for (const [index, receipt] of data.operationReceipts.entries()) {
      if (receipt.status !== 'completed' || !receipt.execution)
        context.addIssue({
          code: 'custom',
          path: ['operationReceipts', index],
          message: 'Delivery requires an execution-bound completed operation receipt.',
        });
      if (
        receipt.execution &&
        (receipt.execution.goalId !== data.execution.goalId ||
          receipt.execution.workNodeId !== data.execution.workNodeId ||
          receipt.execution.harnessRunId !== data.execution.harnessRunId)
      )
        context.addIssue({
          code: 'custom',
          path: ['operationReceipts', index, 'execution'],
          message: 'Every delivery receipt must belong to the same execution.',
        });
      if (seen.has(receipt.operation_id))
        context.addIssue({
          code: 'custom',
          path: ['operationReceipts', index],
          message: 'Delivery operation receipts must be unique.',
        });
      seen.add(receipt.operation_id);
    }
    if (new Set(data.evidenceIds).size !== data.evidenceIds.length)
      context.addIssue({
        code: 'custom',
        path: ['evidenceIds'],
        message: 'Delivery evidence references must be unique.',
      });
    // This lexical refusal does not verify prose. Numeric output belongs to the
    // saved report/evidence artifacts referenced by canonical operation receipts.
    if (
      watchmanReportNarrativeIssue(
        data.delivery.summary,
        [
          data.delivery.markdown ?? '',
          ...data.openItems.limitations,
          ...data.openItems.followUps,
        ].join('\n'),
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['delivery'],
        message:
          'Keep delivery prose qualitative and unverified. Refer to stored report artifacts for numeric metrics.',
      });
  });
export type WatchmanDeliveryData = z.infer<typeof watchmanDeliveryDataSchema>;
