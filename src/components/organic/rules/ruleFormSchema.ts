// Client-side form schema for the comment rule editor.
//
// The contract's rule carries ISO instants and a discriminated post scope; a
// form carries strings from inputs. This schema is the translation layer, and
// it deliberately re-states the contract's cross-field rules rather than
// importing a pre-composed schema: React Hook Form needs the errors attached to
// the field a person can actually see and fix. The backend re-validates
// everything on submit (dual-validation rule).
//
// Decisions worth knowing before changing this file:
// - An empty link is valid: it means the message carries no link at all, and a
//   button label without one would label a button that is never sent.
// - `datetime-local` yields a local wall-clock string or ''. It is kept as typed
//   and converted at the edges, never mid-form.
// - The window error is attached to the pair, not to one date. Whichever of the
//   two was edited last, the complaint is about both together, and blaming one
//   sends people to correct the wrong field.
// - A new rule starts with three public replies. Rotating variations is what
//   keeps a busy post from reading as a bot to the platform; all are deletable.

import {
  type CommentTriggerRule,
  commentTriggerMatchModeSchema,
  commentTriggerPostScopeSchema,
  MAX_KEYWORD_LENGTH,
  MAX_KEYWORDS_PER_RULE,
  MAX_LINK_BUTTON_LABEL_LENGTH,
  MAX_PUBLIC_REPLY_VARIATIONS,
  MAX_REPLY_MESSAGE_LENGTH,
  MAX_REPLY_MESSAGE_LENGTH_WITH_BUTTON,
  type SaveCommentTriggerRuleRequest,
} from '@continuum/contracts';
import { z } from 'zod';

export type RuleValidationKey =
  | 'ruleDmEmpty'
  | 'rulePublicReplyEmpty'
  | 'ruleKeywordRequired'
  | 'rulePostRequired'
  | 'ruleDateOrder'
  | 'ruleUrl'
  | 'ruleMessageButtonLimit'
  | 'ruleMaxCharacters'
  | 'ruleMaxEntries'
  | 'ruleValueRequired';
export type RuleValidationTranslator = (
  key: RuleValidationKey,
  values?: { limit: number },
) => string;
const validationEnglish = {
  ruleDmEmpty: 'The direct message cannot be empty',
  rulePublicReplyEmpty: 'A public reply cannot be empty',
  ruleKeywordRequired: 'Add at least one trigger word',
  rulePostRequired: 'Pick at least one post, or switch to all posts',
  ruleDateOrder: 'The end date is before the start date',
  ruleUrl: 'Enter a full web address starting with https://',
  ruleMessageButtonLimit:
    'With a button, Instagram caps the message at {limit, number} characters. Shorten it, or clear the button text to send the link in the message.',
  ruleMaxCharacters: 'Use at most {limit, number} characters.',
  ruleMaxEntries: 'Use at most {limit, number} entries.',
  ruleValueRequired: 'Enter a value.',
};

export function createRuleFormSchema(
  translate: RuleValidationTranslator = (key, values) =>
    validationEnglish[key].replace(/\{limit, number\}/g, String(values?.limit ?? '')),
) {
  return (
    z
      .object({
        postScope: commentTriggerPostScopeSchema,
        platformPostIds: z
          .array(z.string().min(1, translate('ruleValueRequired')))
          .max(200, translate('ruleMaxEntries', { limit: 200 })),
        keywords: z
          .array(
            z
              .string()
              .min(1, translate('ruleValueRequired'))
              .max(
                MAX_KEYWORD_LENGTH,
                translate('ruleMaxCharacters', { limit: MAX_KEYWORD_LENGTH }),
              ),
          )
          .max(
            MAX_KEYWORDS_PER_RULE,
            translate('ruleMaxEntries', { limit: MAX_KEYWORDS_PER_RULE }),
          ),
        matchMode: commentTriggerMatchModeSchema,
        replyMessage: z
          .string()
          .min(1, translate('ruleDmEmpty'))
          .max(
            MAX_REPLY_MESSAGE_LENGTH,
            translate('ruleMaxCharacters', { limit: MAX_REPLY_MESSAGE_LENGTH }),
          ),
        publicReplyMessages: z
          .array(z.string().min(1, translate('rulePublicReplyEmpty')))
          .max(
            MAX_PUBLIC_REPLY_VARIATIONS,
            translate('ruleMaxEntries', { limit: MAX_PUBLIC_REPLY_VARIATIONS }),
          ),
        linkButtonLabel: z.string().max(
          MAX_LINK_BUTTON_LABEL_LENGTH,
          translate('ruleMaxCharacters', {
            limit: MAX_LINK_BUTTON_LABEL_LENGTH,
          }),
        ),
        destinationUrl: z.string(),
        enabled: z.boolean(),
        activeFrom: z.string(),
        activeUntil: z.string(),
      })
      .refine((form) => form.matchMode === 'any_comment' || form.keywords.length > 0, {
        message: translate('ruleKeywordRequired'),
        path: ['keywords'],
      })
      .refine((form) => form.postScope === 'all_posts' || form.platformPostIds.length > 0, {
        message: translate('rulePostRequired'),
        path: ['platformPostIds'],
      })
      .refine(
        (form) =>
          form.activeFrom === '' ||
          form.activeUntil === '' ||
          Date.parse(form.activeFrom) <= Date.parse(form.activeUntil),
        { message: translate('ruleDateOrder'), path: ['activeWindow'] },
      )
      .refine((form) => form.destinationUrl === '' || isHttpUrl(form.destinationUrl), {
        message: translate('ruleUrl'),
        path: ['destinationUrl'],
      })
      // A button shrinks the room the message has, and Instagram refuses the WHOLE
      // message past its limit rather than trimming it — so an over-long body with a
      // button means the commenter receives nothing at all. The complaint goes on the
      // message, not the label, because the message is what has to get shorter.
      .refine(
        (form) =>
          form.linkButtonLabel.trim() === '' ||
          form.replyMessage.length <= MAX_REPLY_MESSAGE_LENGTH_WITH_BUTTON,
        {
          message: translate('ruleMessageButtonLimit', {
            limit: MAX_REPLY_MESSAGE_LENGTH_WITH_BUTTON,
          }),
          path: ['replyMessage'],
        },
      )
  );
}

export const ruleFormSchema = createRuleFormSchema();

/** Mirrors the contract's destination rule so the form refuses what the server would. */
function isHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return url.username === '' && url.password === '';
}

export type RuleFormValues = z.infer<typeof ruleFormSchema>;

export function emptyRuleForm(): RuleFormValues {
  return {
    postScope: 'all_posts',
    platformPostIds: [],
    keywords: [],
    matchMode: 'contains_word',
    replyMessage: '',
    publicReplyMessages: ['Sent you a DM!', 'Check your inbox', 'Just messaged you'],
    linkButtonLabel: '',
    destinationUrl: '',
    enabled: true,
    activeFrom: '',
    activeUntil: '',
  };
}

function toLocalInput(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function ruleToForm(rule: CommentTriggerRule): RuleFormValues {
  return {
    postScope: rule.postScope,
    platformPostIds: rule.platformPostIds,
    keywords: rule.keywords,
    matchMode: rule.matchMode,
    replyMessage: rule.replyMessage,
    publicReplyMessages: rule.publicReplyMessages,
    linkButtonLabel: rule.linkButtonLabel ?? '',
    destinationUrl: rule.destinationUrl ?? '',
    enabled: rule.enabled,
    activeFrom: toLocalInput(rule.activeFrom),
    activeUntil: toLocalInput(rule.activeUntil),
  };
}

/** Map the form back to what the backend accepts. `existing` supplies the fields the form does not edit. */
export function formToRule(
  values: RuleFormValues,
  context: { brandId: string; existing?: CommentTriggerRule },
): SaveCommentTriggerRuleRequest {
  return {
    ...(context.existing ? { id: context.existing.id } : {}),
    brandId: context.brandId,
    postScope: values.postScope,
    platformPostIds: values.postScope === 'all_posts' ? [] : values.platformPostIds,
    keywords: values.matchMode === 'any_comment' ? [] : values.keywords,
    matchMode: values.matchMode,
    replyMessage: values.replyMessage,
    publicReplyMessages: values.publicReplyMessages,
    destinationUrl: values.destinationUrl === '' ? null : values.destinationUrl,
    linkButtonLabel:
      values.destinationUrl === '' || values.linkButtonLabel === '' ? null : values.linkButtonLabel,
    enabled: values.enabled,
    priority: context.existing?.priority ?? 0,
    activeFrom: fromLocalInput(values.activeFrom),
    activeUntil: fromLocalInput(values.activeUntil),
  };
}
