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
    it('rewords known generation codes and keeps the Backend sentence for unknown ones', () => {
      const blocked = generationErrorCopy('image_blocked', 'finishReason=IMAGE_SAFETY', studioText);
      const unknown = generationErrorCopy('future_code', 'The prompt is too long.', studioText);
      const silent = generationErrorCopy('future_code', undefined, studioText);
      expect(blocked.title).toBe(studio.generationImageBlockedTitle);
      expect(blocked.guidance).toBe(studio.generationImageBlockedGuidance);
      expect(JSON.stringify(blocked)).not.toContain('IMAGE_SAFETY');
      expect(unknown).toEqual({ title: studio.generationFailedTitle, guidance: 'The prompt is too long.' });
      expect(silent.guidance).toBe(studio.generationFailedGuidance);
    });
    it('localizes delivery and render codes, keeps the Backend sentence, and preserves receipt and source values', () => {
      expect(approvalState(job, forgeText)).toEqual({ text: forge.deliveryHeld, tone: 'muted' });
      expect(deliveryReasonText('delivery_bridge_unconfigured', forgeText)).toBe(
        forge.deliveryBridgeUnconfigured,
      );
      expect(describeRenderJobFailure('render_error', forgeText)).toBe(forge.legacyRenderError);
      // The Backend writes these as sentences for a person; only the known codes are reworded.
      expect(deliveryReasonText('The render did not pass its check', forgeText)).toBe(
        'The render did not pass its check',
      );
      expect(describeRenderJobFailure('The font file could not be read.', forgeText)).toBe(
        'The font file could not be read.',
      );
      expect(job.templateName).toBe('Authored card');
      expect(job.deliveryTarget?.adAccountId).toBe('act_123');
    });
  });
}
