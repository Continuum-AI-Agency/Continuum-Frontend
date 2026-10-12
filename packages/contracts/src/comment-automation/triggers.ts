import { z } from 'zod';
import { trackedLinkDestinationSchema, trackedLinkStatsSchema } from '../tracking/links';

// Comment triggers: the ManyChat half of the feature.
//
// A viewer comments a word on a post; we answer them privately. The whole
// product promise lives in deciding *which* rule a comment fires, and the
// decision has to be exactly one — the platform allows a single private reply
// per comment, so "both rules matched" is not an outcome we can express.
//
// Matching is deliberately not configurable beyond `matchMode`. Every knob we
// expose here (case sensitivity, accent folding, punctuation) is a knob a
// customer can set wrong and then report as a bug, and none of them have a
// defensible second setting: nobody wants "PRECIO" to miss because their rule
// said "precio".
//
// Nothing here is Instagram-specific. Instagram comments are simply the first
// caller.

/**
 * How a rule's keywords are compared against a comment.
 *
 * `contains_word` is the default and the one that matches intent: it finds the
 * keyword as a whole word, so a rule for "precio" fires on "precio?" and
 * "cuanto es el precio" but NOT on "que preciosa foto" — a substring match
 * would DM that person by mistake.
 *
 * `exact_phrase` requires the comment to be nothing but the keyword, for
 * campaigns that ask people to comment one specific word.
 *
 * `any_comment` ignores keywords entirely and fires on every comment, for a
 * post where every commenter should get the same reply.
 */
export const commentTriggerMatchModeSchema = z.enum([
  'contains_word',
  'exact_phrase',
  'any_comment',
]);
export type CommentTriggerMatchMode = z.infer<typeof commentTriggerMatchModeSchema>;

/**
 * Which posts a rule listens on.
 *
 * `all_posts` is a standing rule — "anyone who ever comments PRECIO gets the
 * price list" — and is the one-click case: no post picking at all. It is a
 * separate value rather than an empty post list so that "watch everything" and
 * "I haven't chosen posts yet" can never be confused, which is the difference
 * between a rule that answers a whole account and one that answers nobody.
 */
export const commentTriggerPostScopeSchema = z.enum(['all_posts', 'specific_posts']);
export type CommentTriggerPostScope = z.infer<typeof commentTriggerPostScopeSchema>;

/** Posts one rule may be attached to. A ceiling against a runaway bulk-select, not a target. */
export const MAX_POSTS_PER_RULE = 200;

/** Keywords per rule. A ceiling, not a target — long lists are usually a sign the rule wants splitting. */
export const MAX_KEYWORDS_PER_RULE = 25;
export const MAX_KEYWORD_LENGTH = 60;

/**
 * Our cap on the private reply body. Platforms impose their own, lower than
 * anything a user would hit by accident; this exists so an over-long message is
 * refused when the rule is saved rather than when it is sent, where the failure
 * would be invisible to the person who wrote it.
 */
export const MAX_REPLY_MESSAGE_LENGTH = 900;

/**
 * The same body, when the rule gives its link a button label.
 *
 * Instagram sends a button as a template whose `text` field Meta documents at
 * "up to 640 characters", and it refuses the WHOLE message past that — the
 * commenter receives nothing, with no sign of why. A plain-text message has room
 * for 1000, which is where the 900 above comes from, so the ceiling moves
 * depending on a choice made three fields away.
 */
export const MAX_REPLY_MESSAGE_LENGTH_WITH_BUTTON = 640;

/**
 * Public reply variations kept per rule. Answering a hundred commenters with
 * one identical sentence is what platform spam detection is built to catch, and
 * the account that pays for it is the customer's. Rotating a handful of
 * phrasings is not a nicety — it is what keeps the rule usable at volume.
 */
export const MAX_PUBLIC_REPLY_VARIATIONS = 10;

/** Button labels are rendered in a fixed-width chip; long ones are truncated by the platform, not by us. */
export const MAX_LINK_BUTTON_LABEL_LENGTH = 20;

/**
 * There is no follow-up message, and there cannot be one.
 *
 * The idea was to nudge someone who got the private reply and never answered.
 * Meta does not allow it: "only when the Instagram user responds to the private
 * message can you continue the conversation". One message per comment is all
 * there is, and a person who ignores it cannot be written to again.
 *
 * `followUpMessage` and `followUpDelayMinutes` were carried here, stored and read
 * back for weeks with nothing able to send them — a promise the platform forbids
 * us to keep. The columns are left in the database because dropping them is
 * destructive and they harm nothing empty.
 */

/** The fields of a rule, before the cross-field invariants below are applied. */
const commentTriggerRuleFields = z.object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    /**
     * Which posts this rule watches. A rule aimed at named posts always beats a
     * standing `all_posts` rule, so a general fallback can sit alongside
     * per-campaign rules without fighting them.
     */
    postScope: commentTriggerPostScopeSchema,
    /** Empty for `all_posts`. See `postScope` for why the two are not collapsed. */
    platformPostIds: z.array(z.string().min(1)).max(MAX_POSTS_PER_RULE),
    /**
     * When the rule is live. Both `null` means "from now until switched off".
     *
     * A campaign rule outlives its campaign unless something stops it: without
     * an end date, a November promo is still answering strangers in March with
     * a link that died in December. The end date is how a rule stops being the
     * account owner's problem to remember.
     */
    activeFrom: z.string().datetime().nullable(),
    activeUntil: z.string().datetime().nullable(),
    keywords: z.array(z.string().min(1).max(MAX_KEYWORD_LENGTH)).max(MAX_KEYWORDS_PER_RULE),
    matchMode: commentTriggerMatchModeSchema,
    /** The private message sent to the commenter. */
    replyMessage: z.string().min(1).max(MAX_REPLY_MESSAGE_LENGTH),
    /**
     * Public answers on the comment itself, so the thread doesn't look ignored.
     * A list rather than one string: the sender picks one per comment so a busy
     * post doesn't fill with the same sentence — see MAX_PUBLIC_REPLY_VARIATIONS.
     * Empty means no public reply, which is why there is no separate on/off flag
     * to contradict it.
     */
    publicReplyMessages: z
      .array(z.string().min(1).max(MAX_REPLY_MESSAGE_LENGTH))
      .max(MAX_PUBLIC_REPLY_VARIATIONS),
    /**
     * The tracked link attached to the private message. Assigned by the server
     * from `destinationUrl` — a rule owns one link, and keeping the id out of
     * the caller's hands is what stops a rule pointing at another brand's link.
     */
    trackedLinkId: z.string().uuid().nullable(),
    /**
     * Where that link sends people. Read back with the rule so the editor can
     * show it, and the only half of the pair a caller may set.
     */
    destinationUrl: trackedLinkDestinationSchema.nullable(),
    /**
     * Text on the button carrying the link. The link rides a button rather than
     * sitting as a bare URL in the message body, because a button is tapped and
     * a URL in a paragraph is scrolled past. `null` takes the product default.
     */
    linkButtonLabel: z.string().min(1).max(MAX_LINK_BUTTON_LABEL_LENGTH).nullable(),
    enabled: z.boolean(),
    /** Higher wins. Ties fall through to a deterministic rule — see `matchCommentTrigger`. */
    priority: z.number().int().min(0).max(1000),
    createdAt: z.string(),
});

/**
 * Cross-field rules, held in one place because two schemas enforce them: the
 * stored rule and the save request the screen posts. Sharing the predicates is
 * what stops the form from accepting something the database will reject.
 */
type RuleInvariantFields = Pick<
  z.infer<typeof commentTriggerRuleFields>,
  'matchMode' | 'keywords' | 'postScope' | 'platformPostIds' | 'activeFrom' | 'activeUntil'
>;

const hasKeywordsWhenNeeded = (rule: RuleInvariantFields) =>
  rule.matchMode === 'any_comment' || rule.keywords.length > 0;
const KEYWORDS_NEEDED = { message: 'keyword rules need at least one keyword', path: ['keywords'] };

const hasPostsWhenNeeded = (rule: RuleInvariantFields) =>
  rule.postScope === 'all_posts' || rule.platformPostIds.length > 0;
const POSTS_NEEDED = {
  message: 'a rule scoped to specific posts needs at least one post',
  path: ['platformPostIds'],
};

/**
 * A button shrinks the room the message has. Checked here rather than on the
 * field, because the limit depends on `linkButtonLabel`.
 */
const replyFitsTheButtonTemplate = (rule: {
  replyMessage: string;
  linkButtonLabel: string | null;
}) =>
  (rule.linkButtonLabel ?? '').trim() === '' ||
  rule.replyMessage.length <= MAX_REPLY_MESSAGE_LENGTH_WITH_BUTTON;
const REPLY_FITS_BUTTON = {
  message: `a message sent with a button cannot pass ${MAX_REPLY_MESSAGE_LENGTH_WITH_BUTTON} characters — Instagram refuses the whole message`,
  path: ['replyMessage'],
};

const windowIsOrdered = (rule: RuleInvariantFields) =>
  rule.activeFrom === null ||
  rule.activeUntil === null ||
  Date.parse(rule.activeFrom) <= Date.parse(rule.activeUntil);
const WINDOW_ORDERED = { message: 'the rule cannot end before it starts', path: ['activeUntil'] };

/**
 * Deliberately WITHOUT `replyFitsTheButtonTemplate`. Rules saved before that
 * limit existed may already be over it, and this schema parses the listing: one
 * row failing takes the whole screen down with it, showing "could not load the
 * rules" for rules that are fine. That exact failure has happened once already,
 * over a date format. The limit is enforced where it can be acted on — when
 * someone saves — and the send path caps the body so an old rule still delivers.
 */
export const commentTriggerRuleSchema = commentTriggerRuleFields
  .refine(hasKeywordsWhenNeeded, KEYWORDS_NEEDED)
  .refine(hasPostsWhenNeeded, POSTS_NEEDED)
  .refine(windowIsOrdered, WINDOW_ORDERED);
export type CommentTriggerRule = z.infer<typeof commentTriggerRuleSchema>;

/** The single rule a comment fired, and the keyword that did it. */
export const commentTriggerMatchSchema = z.object({
  ruleId: z.string().uuid(),
  /** `null` for an `any_comment` rule, which fires without a keyword. */
  matchedKeyword: z.string().nullable(),
});
export type CommentTriggerMatch = z.infer<typeof commentTriggerMatchSchema>;

/** The part of an inbound comment that matching actually reads. */
export const commentTriggerCandidateSchema = z.object({
  platformCommentId: z.string().min(1),
  platformPostId: z.string().min(1),
  /** The commenter. Compared against the brand's own account to avoid replying to ourselves. */
  authorPlatformUserId: z.string().min(1),
  text: z.string(),
});
export type CommentTriggerCandidate = z.infer<typeof commentTriggerCandidateSchema>;

/** What the rules screen sends when saving. The server owns brand scoping and timestamps. */
export const saveCommentTriggerRuleRequestSchema = commentTriggerRuleFields
  .omit({ id: true, createdAt: true, trackedLinkId: true })
  .extend({
    /** Present when editing an existing rule, absent when creating one. */
    id: z.string().uuid().optional(),
  })
  .refine(hasKeywordsWhenNeeded, KEYWORDS_NEEDED)
  .refine(hasPostsWhenNeeded, POSTS_NEEDED)
  .refine(windowIsOrdered, WINDOW_ORDERED)
  .refine(replyFitsTheButtonTemplate, REPLY_FITS_BUTTON);
export type SaveCommentTriggerRuleRequest = z.infer<typeof saveCommentTriggerRuleRequestSchema>;

/**
 * How long one person waits between private replies from the same rule.
 *
 * Lives here because both sides state it: the Backend enforces it and the editor
 * tells the person writing a rule what will happen. Two copies of a number like
 * this drift, and the screen is the copy that ends up lying.
 */
export const PRIVATE_REPLY_COOLDOWN_MINUTES = 24 * 60;

export const listCommentTriggerRulesResponseSchema = z.object({
  rules: z.array(commentTriggerRuleSchema),
  /**
   * Clicks for the links these rules hand out, one entry per link that exists.
   * A rule with no link has no entry, and a link nobody clicked has an entry
   * reading zero — absent and zero are different answers.
   *
   * Defaulted rather than required: a Frontend that ships before the Backend
   * would otherwise fail the whole parse and blank the screen over a field it
   * only uses to draw a number.
   */
  linkStats: z.array(trackedLinkStatsSchema).default([]),
});
export type ListCommentTriggerRulesResponse = z.infer<typeof listCommentTriggerRulesResponseSchema>;
