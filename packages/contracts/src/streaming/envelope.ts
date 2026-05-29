import { z } from "zod";

export const streamEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
});

export type StreamEnvelope = z.infer<typeof streamEnvelopeSchema>;

export type EnvelopeMint = (seq: number) => StreamEnvelope;

export const createEnvelopeMint = (now: () => Date = () => new Date()): EnvelopeMint => {
  return (seq: number) => ({
    eventId: cryptoRandomId(),
    seq,
    ts: now().toISOString(),
  });
};

const cryptoRandomId = (): string => {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return `evt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};
