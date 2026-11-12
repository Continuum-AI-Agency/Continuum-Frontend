import { describe, expect, it } from 'bun:test';
import { campaignChecklistRegistry } from '@continuum/contracts';
import { createTranslator } from 'next-intl';
import en from '../../../messages/dashboard/en.json';
import es from '../../../messages/dashboard/es.json';
import pt from '../../../messages/dashboard/pt-BR.json';
import { goalSnapshotWithChatDeliveriesSchema, projectGoalDelivery } from './chatDelivery';
import { goalChecklistBlocker, goalChecklistCopy, goalChecklistSummary } from './checklistCopy';
import { projectGoalWorkspace } from './projection';

const actor = {
  kind: 'human',
  userId: '00000000-0000-4000-8000-000000000001',
} as const;
const now = '2026-07-26T12:00:00.000Z';
const snapshot = goalSnapshotWithChatDeliveriesSchema.parse({
  goal: {
    id: 'goal_1',
    brandId: 'brand_1',
    kind: 'campaign',
    title: 'Customer title — keep this',
    objective: 'Objective written by the customer',
    successCriteria: [{ id: 'one', statement: 'Keep authored content' }],
    visibility: 'brand',
    status: 'active',
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
    version: 1,
  },
  plans: [],
  workstreams: [],
  assignments: [],
  artifacts: [],
  requests: [],
  evidence: [],
  decisions: [],
  resources: [],
  dependencies: [],
  alignments: [],
  lastSeq: 0,
  revision: 1,
});
const delivery = {
  id: 'delivery_1',
  requestId: 'request_1',
  recipientUserId: actor.userId,
  platform: 'teams',
  status: 'failed',
  failureSummary: 'Raw provider diagnostic in English',
  createdAt: now,
  updatedAt: now,
} as const;
const definitions = Object.values(campaignChecklistRegistry).flat();
for (const { locale, messages } of [
  { locale: 'en', messages: en },
  { locale: 'pt-BR', messages: pt },
  { locale: 'es', messages: es },
] as const) {
  const t = createTranslator({
    locale,
    timeZone: 'UTC',
    namespace: 'dashboard',
    messages: { dashboard: messages },
    onError(error) {
      throw error;
    },
  });
  describe(`Goal display boundaries ${locale}`, () => {
    it('localizes every canonical checklist definition and leaves custom questions unchanged', () => {
      for (const definition of definitions) {
        const view = goalChecklistCopy(definition, t);
        expect(view.label.length).toBeGreaterThan(0);
        expect(view.question.includes(view.label)).toBe(true);
        expect(view.question.startsWith('m_')).toBe(false);
        if (locale !== 'en') {
          expect(view.label).not.toBe(definition.label);
          expect(view.question).not.toBe(definition.question);
        }
      }
      const custom = {
        ...definitions[0]!,
        question: 'Question written by the customer',
      };
      expect(goalChecklistCopy(custom, t)).toEqual({
        label: custom.label,
        question: custom.question,
      });
    });
    it('formats confidence, evidence and request counts without exposing raw diagnostics', () => {
      const message = goalChecklistBlocker('Confidence 0.50 is below the required 0.80.', t);
      expect(message).toContain(locale === 'en' ? '0.50' : '0,50');
      expect(message).toContain(locale === 'en' ? '0.80' : '0,80');
      expect(goalChecklistBlocker('Raw provider diagnostic in English', t)).not.toContain(
        'Raw provider',
      );
      expect(goalChecklistSummary('evidence_required', 1, 2, t)).not.toContain('m_');
    });
    it('translates delivery guidance while retaining identity, status and source diagnostics', () => {
      const projected = projectGoalDelivery(delivery, t);
      expect(projected.detail).not.toContain('Raw provider');
      expect(projected.id).toBe(delivery.id);
      expect(projected.status).toBe('failed');
      expect(delivery.failureSummary).toBe('Raw provider diagnostic in English');
    });
    it('projects localized chrome without changing authored goals or the snapshot', () => {
      const before = JSON.stringify(snapshot);
      const view = projectGoalWorkspace(snapshot, [], t, locale);
      expect(view.title).toBe(snapshot.goal.title);
      expect(view.outcome).toBe(snapshot.goal.objective);
      expect(view.participants[0]?.name).toBe(actor.userId);
      expect(view.participants[0]?.detail).toBe(
        locale === 'en'
          ? 'Goal creator'
          : locale === 'pt-BR'
            ? 'Criador da meta'
            : 'Creador del objetivo',
      );
      expect(JSON.stringify(snapshot)).toBe(before);
    });
  });
}
