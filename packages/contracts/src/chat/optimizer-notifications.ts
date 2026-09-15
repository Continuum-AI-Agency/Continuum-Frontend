import { z } from 'zod';

// Opt-in and destination for the optimizer's money-move ping. The Backend reads this
// to decide whether to queue a delivery at all and where to post it; the Frontend
// settings panel writes it. Both sides import from here so a destination the UI can
// express is always one the worker can address.

const slackIdSchema = z.string().trim().min(1).max(240);

export const optimizerPingDestinationSchema = z.enum(['dm', 'channel']);
export type OptimizerPingDestination = z.infer<typeof optimizerPingDestinationSchema>;

export const slackChannelSchema = z
  .object({
    id: slackIdSchema,
    name: z.string().trim().min(1).max(300),
    isPrivate: z.boolean(),
    // Public channels are reachable without joining (chat:write.public). A private
    // channel the bot is not a member of cannot be posted to, and the UI has to say so
    // BEFORE someone picks it -- otherwise the failure surfaces an hour later in a
    // worker log nobody reads.
    isMember: z.boolean(),
  })
  .strict();
export type SlackChannel = z.infer<typeof slackChannelSchema>;

export const optimizerNotificationSettingsSchema = z
  .object({
    // No subscription row at all. Every other field is meaningless while this is false.
    enabled: z.boolean(),
    destination: optimizerPingDestinationSchema.nullable(),
    channelId: slackIdSchema.nullable(),
    channelName: z.string().trim().min(1).max(300).nullable(),
    connectionId: z.string().uuid().nullable(),
  })
  .strict();
export type OptimizerNotificationSettings = z.infer<typeof optimizerNotificationSettingsSchema>;

/**
 * A channel subscription names a channel; a DM subscription names nobody, because the
 * Backend resolves the caller's own Slack identity from their Continuum email. Asking
 * the client for a connection id would let one user route another user's DMs.
 */
export const saveOptimizerNotificationRequestSchema = z.discriminatedUnion('destination', [
  z.object({ destination: z.literal('dm') }).strict(),
  z
    .object({
      destination: z.literal('channel'),
      channelId: slackIdSchema,
      channelName: z.string().trim().min(1).max(300).optional(),
    })
    .strict(),
]);
export type SaveOptimizerNotificationRequest = z.infer<
  typeof saveOptimizerNotificationRequestSchema
>;
