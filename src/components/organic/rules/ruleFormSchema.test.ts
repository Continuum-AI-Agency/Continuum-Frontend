import { describe, expect, it } from 'bun:test';
import { saveCommentTriggerRuleRequestSchema } from '@continuum/contracts';
import {
  emptyRuleForm,
  formToRule,
  ruleFormSchema,
  ruleToForm,
  type RuleFormValues,
} from './ruleFormSchema';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const RULE_ID = '22222222-2222-4222-8222-222222222222';

function filled(overrides: Partial<RuleFormValues> = {}): RuleFormValues {
  return {
    ...emptyRuleForm(),
    keywords: ['precio'],
    replyMessage: '¡Hola! Acá tenés la guía',
    ...overrides,
  };
}

describe('ruleFormSchema', () => {
  it('accepts a minimal complete rule', () => {
    expect(ruleFormSchema.safeParse(filled()).success).toBe(true);
  });

  it('asks for a trigger word unless the rule answers every comment', () => {
    const noKeywords = ruleFormSchema.safeParse(filled({ keywords: [] }));
    expect(noKeywords.success).toBe(false);
    // The message has to land on the field a person can fix, not on the form.
    expect(noKeywords.success === false && noKeywords.error.issues[0].path).toEqual(['keywords']);

    expect(
      ruleFormSchema.safeParse(filled({ keywords: [], matchMode: 'any_comment' })).success,
    ).toBe(true);
  });

  it('asks for a post when the rule is scoped to specific posts', () => {
    expect(ruleFormSchema.safeParse(filled({ postScope: 'specific_posts' })).success).toBe(false);
    expect(
      ruleFormSchema.safeParse(
        filled({ postScope: 'specific_posts', platformPostIds: ['17912345678901234'] }),
      ).success,
    ).toBe(true);
  });

  it('blames the pair of dates, not one of them', () => {
    // The complaint is about both together: whichever field you edited last,
    // the message has to appear in the same place.
    const backwards = ruleFormSchema.safeParse(
      filled({ activeFrom: '2026-10-01T09:00', activeUntil: '2026-09-01T09:00' }),
    );
    expect(backwards.success).toBe(false);
    expect(backwards.success === false && backwards.error.issues[0].path).toEqual(['activeWindow']);
  });

  it('refuses a destination that is not a web address', () => {
    for (const destinationUrl of ['javascript:alert(1)', 'yoursite.com', 'not a url']) {
      expect(ruleFormSchema.safeParse(filled({ destinationUrl })).success).toBe(false);
    }
    expect(
      ruleFormSchema.safeParse(filled({ destinationUrl: 'https://yoursite.com/guide' })).success,
    ).toBe(true);
    expect(ruleFormSchema.safeParse(filled({ destinationUrl: '' })).success).toBe(true);
  });

  it('treats an empty date as no bound rather than as an error', () => {
    expect(ruleFormSchema.safeParse(filled({ activeFrom: '', activeUntil: '' })).success).toBe(true);
    expect(ruleFormSchema.safeParse(filled({ activeUntil: '2026-10-01T09:00' })).success).toBe(true);
  });
});

describe('formToRule', () => {
  it('produces something the backend accepts', () => {
    const rule = formToRule(filled(), { brandId: BRAND_ID });
    expect(saveCommentTriggerRuleRequestSchema.safeParse(rule).success).toBe(true);
    expect(rule.id).toBeUndefined();
  });

  it('turns empty dates into no bound, and filled ones into instants', () => {
    const none = formToRule(filled(), { brandId: BRAND_ID });
    expect(none.activeFrom).toBeNull();
    expect(none.activeUntil).toBeNull();

    const bounded = formToRule(filled({ activeUntil: '2026-10-01T09:00' }), { brandId: BRAND_ID });
    expect(bounded.activeUntil).not.toBeNull();
    expect(new Date(bounded.activeUntil as string).getFullYear()).toBe(2026);
  });

  it('turns an empty button label into no label', () => {
    const withLink = { destinationUrl: 'https://yoursite.com/guide' };
    expect(
      formToRule(filled({ ...withLink, linkButtonLabel: '' }), { brandId: BRAND_ID })
        .linkButtonLabel,
    ).toBeNull();
    expect(
      formToRule(filled({ ...withLink, linkButtonLabel: 'Open the guide' }), { brandId: BRAND_ID })
        .linkButtonLabel,
    ).toBe('Open the guide');
  });

  it('drops a button label left behind by clearing the link', () => {
    // Someone types a label, removes the link, and saves. A label for a button
    // that is never sent must not travel with the rule.
    const rule = formToRule(filled({ destinationUrl: '', linkButtonLabel: 'Open the guide' }), {
      brandId: BRAND_ID,
    });
    expect(rule.linkButtonLabel).toBeNull();
  });

  it('turns an empty link into no link, and never sends an id', () => {
    const none = formToRule(filled(), { brandId: BRAND_ID });
    expect(none.destinationUrl).toBeNull();
    // The link id is the server's to assign; a caller must not be able to point
    // a rule at a link it does not own.
    expect('trackedLinkId' in none).toBe(false);

    const withLink = formToRule(filled({ destinationUrl: 'https://yoursite.com/guide' }), {
      brandId: BRAND_ID,
    });
    expect(withLink.destinationUrl).toBe('https://yoursite.com/guide');
  });

  it('starts a new rule with three public replies', () => {
    // Rotating variations is what keeps a busy post from reading as a bot.
    expect(emptyRuleForm().publicReplyMessages).toHaveLength(3);
  });

  it('drops post ids left behind by switching back to all posts', () => {
    // Someone picks posts, changes their mind, and saves. The stale list must
    // not travel with a rule that says it watches everything.
    const rule = formToRule(filled({ postScope: 'all_posts', platformPostIds: ['post-1'] }), {
      brandId: BRAND_ID,
    });
    expect(rule.platformPostIds).toEqual([]);
    expect(saveCommentTriggerRuleRequestSchema.safeParse(rule).success).toBe(true);
  });

  it('drops keywords left behind by switching to any_comment', () => {
    const rule = formToRule(filled({ matchMode: 'any_comment' }), { brandId: BRAND_ID });
    expect(rule.keywords).toEqual([]);
    expect(saveCommentTriggerRuleRequestSchema.safeParse(rule).success).toBe(true);
  });

  it('carries the id and the fields the form does not edit when editing', () => {
    const existing = {
      id: RULE_ID,
      brandId: BRAND_ID,
      postScope: 'all_posts' as const,
      platformPostIds: [],
      keywords: ['precio'],
      matchMode: 'contains_word' as const,
      replyMessage: 'hola',
      publicReplyMessages: [],
      trackedLinkId: '33333333-3333-4333-8333-333333333333',
      destinationUrl: 'https://example.com/guide',
      linkButtonLabel: null,
      followUpMessage: 'still interested?',
      followUpDelayMinutes: 1440,
      enabled: true,
      priority: 900,
      activeFrom: null,
      activeUntil: null,
      createdAt: '2026-09-14T00:00:00.000Z',
    };

    const rule = formToRule(filled(), { brandId: BRAND_ID, existing });
    expect(rule.id).toBe(RULE_ID);
    // The form has no controls for these; an edit must not quietly erase them.
    expect(rule.followUpMessage).toBe('still interested?');
    expect(rule.followUpDelayMinutes).toBe(1440);
    expect(rule.priority).toBe(900);
  });

  it('survives a round trip through the form', () => {
    const existing = {
      id: RULE_ID,
      brandId: BRAND_ID,
      postScope: 'specific_posts' as const,
      platformPostIds: ['post-1', 'post-2'],
      keywords: ['precio', 'info'],
      matchMode: 'contains_word' as const,
      replyMessage: 'acá tenés',
      publicReplyMessages: ['¡Te escribí!', 'Revisá tu bandeja'],
      trackedLinkId: null,
      destinationUrl: 'https://example.com/guide',
      linkButtonLabel: 'Open the guide',
      followUpMessage: null,
      followUpDelayMinutes: 0,
      enabled: false,
      priority: 0,
      activeFrom: '2026-09-01T12:00:00.000Z',
      activeUntil: '2026-09-30T12:00:00.000Z',
      createdAt: '2026-09-14T00:00:00.000Z',
    };

    const back = formToRule(ruleToForm(existing), { brandId: BRAND_ID, existing });
    expect(back.keywords).toEqual(existing.keywords);
    expect(back.platformPostIds).toEqual(existing.platformPostIds);
    expect(back.publicReplyMessages).toEqual(existing.publicReplyMessages);
    expect(back.linkButtonLabel).toBe('Open the guide');
    expect(back.destinationUrl).toBe('https://example.com/guide');
    expect(back.enabled).toBe(false);
    expect(back.activeFrom).toBe(existing.activeFrom);
    expect(back.activeUntil).toBe(existing.activeUntil);
  });
});
