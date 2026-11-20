import { z } from 'zod';

/** Known application reasons; legacy provider codes and diagnostic fields remain compatible. */
export const audienceProposalErrorCodes = {
  propose_failed: 'propose_failed',
  execute_failed: 'execute_failed',
  activate_failed: 'activate_failed',
  undo_failed: 'undo_failed',
  signal_stopped: 'signal_stopped',
  cbo_campaign: 'cbo_campaign',
  targeting_changed: 'targeting_changed',
  meta_permission: 'meta_permission',
} as const;
export const audienceProposalErrorCodeSchema = z.enum(audienceProposalErrorCodes);
export type AudienceProposalErrorCode = z.infer<typeof audienceProposalErrorCodeSchema>;
export const audienceProposalErrorSchema = z
  .object({
    code: audienceProposalErrorCodeSchema,
    message: z.string().optional(),
  })
  .passthrough();
