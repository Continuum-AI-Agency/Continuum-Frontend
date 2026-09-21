// Client-side form schema for the comment rule editor.
//
// The contract's rule carries ISO instants and a discriminated post scope; a
// form carries strings from inputs. This schema is the translation layer, and
// it deliberately re-states the contract's cross-field rules rather than
// importing a pre-composed schema: React Hook Form needs the errors attached to
// the field a person can actually see and fix. The backend re-validates
// everything on submit (dual-validation rule).

import {
  type CommentTriggerRule,
  MAX_KEYWORDS_PER_RULE,
  MAX_KEYWORD_LENGTH,
  MAX_LINK_BUTTON_LABEL_LENGTH,
  MAX_PUBLIC_REPLY_VARIATIONS,
  MAX_REPLY_MESSAGE_LENGTH,
  type SaveCommentTriggerRuleRequest,
  commentTriggerMatchModeSchema,
  commentTriggerPostScopeSchema,
} from '@continuum/contracts';
import { z } from 'zod';

export const ruleFormSchema = z
  .object({
    postScope: commentTriggerPostScopeSchema,
    platformPostIds: z.array(z.string().min(1)).max(200),
    keywords: z.array(z.string().min(1).max(MAX_KEYWORD_LENGTH)).max(MAX_KEYWORDS_PER_RULE),
    matchMode: commentTriggerMatchModeSchema,
    replyMessage: z
      .string()
      .min(1, 'The direct message cannot be empty')
      .max(MAX_REPLY_MESSAGE_LENGTH),
    publicReplyMessages: z
      .array(z.string().min(1, 'A public reply cannot be empty'))
      .max(MAX_PUBLIC_REPLY_VARIATIONS),
    linkButtonLabel: z.string().max(MAX_LINK_BUTTON_LABEL_LENGTH),
    // Empty means the message carries no link at all, which is valid.
    destinationUrl: z.string(),
    enabled: z.boolean(),
    // `datetime-local` gives a local wall-clock string or ''. Kept as typed for
    // the field and converted at the edges.
    activeFrom: z.string(),
    activeUntil: z.string(),
  })
  .refine((form) => form.matchMode === 'any_comment' || form.keywords.length > 0, {
    message: 'Add at least one trigger word',
    path: ['keywords'],
  })
  .refine((form) => form.postScope === 'all_posts' || form.platformPostIds.length > 0, {
    message: 'Pick at least one post, or switch to all posts',
    path: ['platformPostIds'],
  })
  .refine(
    (form) =>
      form.activeFrom === '' ||
      form.activeUntil === '' ||
      Date.parse(form.activeFrom) <= Date.parse(form.activeUntil),
    // Attached to the pair, not to one field: whichever of the two you edited,
    // the complaint is about both of them together.
    { message: 'The end date is before the start date', path: ['activeWindow'] },
  )
  .refine((form) => form.destinationUrl === '' || isHttpUrl(form.destinationUrl), {
    message: 'Enter a full web address starting with https://',
    path: ['destinationUrl'],
  });

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
    // Three starters, because rotating variations is what keeps a busy post
    // from reading as a bot to the platform. All of them are deletable.
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
    // A button label without a link would label a button that is never sent.
    linkButtonLabel:
      values.destinationUrl === '' || values.linkButtonLabel === ''
        ? null
        : values.linkButtonLabel,
    followUpMessage: context.existing?.followUpMessage ?? null,
    followUpDelayMinutes: context.existing?.followUpDelayMinutes ?? 0,
    enabled: values.enabled,
    priority: context.existing?.priority ?? 0,
    activeFrom: fromLocalInput(values.activeFrom),
    activeUntil: fromLocalInput(values.activeUntil),
  };
}
