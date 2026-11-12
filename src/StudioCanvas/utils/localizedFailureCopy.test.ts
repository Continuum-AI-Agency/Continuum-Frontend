import { describe, expect, it } from 'bun:test';
import { apiRenderJobSchema } from '@continuum/contracts';
import { createTranslator } from 'next-intl';
import { approvalState, deliveryReasonText } from '@/components/forge/DeliveryChain';
import { describeRenderJobFailure } from '@/components/forge/renderJobFailureCopy';
import forgeEs from '../../../messages/forge/es.json';
import forgePt from '../../../messages/forge/pt-BR.json';
import studioEs from '../../../messages/studio/es.json';
import studioPt from '../../../messages/studio/pt-BR.json';
import { generationErrorCopy } from './generationErrorCopy';

const job = apiRenderJobSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  brandId: '22222222-2222-4222-8222-222222222222',
  templateKey: '67',
  templateName: 'Authored card',
  contractHash: 'hash',
  taskUid: 'T-1',
  status: 'finished',
  outputs: [],
  delivery: [],
  error: null,
  createdAt: '2026-09-18T00:00:00.000Z',
  updatedAt: '2026-09-18T00:00:00.000Z',
  deliveryTarget: {
    action: 'create',
    adAccountId: 'act_123',
    campaignId: 'campaign',
    adsetId: 'adset',
  },
});

for (const [locale, forge, studio] of [
  ['pt-BR', forgePt, studioPt],
  ['es', forgeEs, studioEs],
] as const) {
  describe(`${locale} code-based failure guidance`, () => {
    const forgeText = createTranslator({ locale, messages: { forge }, namespace: 'forge' });
    const studioText = createTranslator({ locale, messages: { studio }, namespace: 'studio' });
    it('uses stable generation codes and keeps provider diagnostics out of rendered guidance', () => {
      const blocked = generationErrorCopy('image_blocked', 'finishReason=IMAGE_SAFETY', studioText);
      const unknown = generationErrorCopy('future_code', 'private provider diagnostic', studioText);
      expect(blocked.title).toBe(studio.generationImageBlockedTitle);
      expect(blocked.guidance).toBe(studio.generationImageBlockedGuidance);
      expect(unknown.guidance).toBe(studio.generationFailedGuidance);
      expect(JSON.stringify(blocked)).not.toContain('IMAGE_SAFETY');
      expect(JSON.stringify(unknown)).not.toContain('provider diagnostic');
    });
    it('localizes delivery and render failures while preserving receipt and source values', () => {
      expect(approvalState(job, forgeText)).toEqual({ text: forge.deliveryHeld, tone: 'muted' });
      expect(deliveryReasonText('delivery_bridge_unconfigured', forgeText)).toBe(
        forge.deliveryBridgeUnconfigured,
      );
      expect(deliveryReasonText('future_delivery_reason', forgeText)).toBe(
        forge.deliveryUnknownReason,
      );
      expect(describeRenderJobFailure('render_error', forgeText)).toBe(forge.legacyRenderError);
      expect(describeRenderJobFailure('private provider diagnostic', forgeText)).toBe(
        forge.renderFailedGuidance,
      );
      expect(job.templateName).toBe('Authored card');
      expect(job.deliveryTarget?.adAccountId).toBe('act_123');
    });
  });
}
