'use client';

import { useLocale, useTranslations } from 'next-intl';

// What the person on the other end actually receives, drawn from the fields as
// they are typed.
//
// It exists because the combined effect of six message fields was invisible
// until it reached a stranger: a rule whose own text read "click the button
// below" was sent with no button, and that shipped because nobody could see the
// message before it went out.
//
// Decisions worth knowing before changing this file:
// - This is the COMMENTER's view, not ours. From their side the brand's message
//   is an incoming one, so it is left-aligned under the account's name, which is
//   also how Instagram draws it.
// - THE LABEL IS WHAT CREATES THE BUTTON. With no label the link travels in the
//   message text instead, which is the form every client can render.
// - What was actually OBSERVED about buttons: they render in the Instagram app on
//   a phone, and do not render on instagram.com from a desktop browser OR from a
//   phone browser. Both were checked, which is why this now says "does not"
//   where it once hedged with "may not". Meta documents structured templates as
//   unsupported on desktop, so the limit is theirs; `ButtonReachNote` is where
//   the person writing a rule is told about it.
// - That caveat NAMES THE BUTTON. It sits under the message, and worded as
//   "shows in the app, not in a browser" it was read as being about the whole
//   message — as if the DM itself never arrived in a browser, which is false and
//   alarming. A line floating under a block has to say what it is about.
// - It says "in a browser", not "instagram.com". The domain is our word for it;
//   a reader seeing it can take the warning to mean Instagram as a whole, which
//   is both wider than the truth and the opposite of reassuring.
// - The button belongs INSIDE the message. What we send is one message whose
//   payload carries `text` and `buttons` together, so drawing the button as a
//   separate bubble would show a conversation that never happens.
// - The link IN THE TEXT is the tracked address, because that is what is sent.
//   An earlier version printed the destination there, so the preview showed a
//   message nobody receives. A rule not saved yet has no short link — it is made
//   on save — so that case is drawn as an absence rather than filled with the
//   destination, which would be inventing the message all over again.
// - The button opens the DESTINATION, never the tracked address. Opening the
//   tracked one would record a click nobody made; opening the destination costs
//   nothing and catches the one mistake a person can actually make here, which
//   is mistyping it. Only when it parses as http(s) — a half-typed address must
//   not become a link.
// - It draws the APP rendering. The same message shows a button in the Instagram
//   app and no button on instagram.com, so the panel says which one this is.
// - Absent fields are drawn as absences, never filled with plausible defaults.
//   A preview that invents a public reply hides the mistake it is here to catch.
// - The last block states what the rule DOES. Those facts appear nowhere else in
//   the product, and a preview showing a cheerful message for a switched-off
//   rule is a lie the panel can tell. They are label-and-value rows rather than
//   sentences: sentences get read, rows get scanned, and the labels carry enough
//   meaning to shorten every value.
// - Every row is always present, its wording changing with the rule. A row that
//   vanishes makes the block jump and hides the fact it was stating.
// - Each row names its own subject — "reply", "comment", "message" — and its
//   label repeats the field label it describes. A row has to be readable on its
//   own, and the panel must not invent a second name for something the form
//   already calls something else.
// - Both names are the same grey. The words already say which is which, and
//   Instagram gives your own handle no extra weight either.

import { PRIVATE_REPLY_COOLDOWN_MINUTES } from '@continuum/contracts';
import type { RuleFormValues } from './ruleFormSchema';

const COMMENTER_HANDLE = '@commenter';

/** Valid only once it parses, so a half-typed address never becomes a link. */
function openableDestination(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function Avatar({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-2xs font-medium text-muted-foreground"
    >
      {label}
    </span>
  );
}

function Absence({ children }: { children: React.ReactNode }) {
  return <p className="text-2xs italic text-muted-foreground">{children}</p>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-2xs font-medium text-muted-foreground">{children}</p>;
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-2 border-b border-border/60 py-1.5 first:pt-0 last:border-b-0 last:pb-0">
      <dt className="text-2xs font-medium text-foreground">{label}</dt>
      <dd className="text-2xs leading-snug text-muted-foreground">{children}</dd>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs font-medium leading-snug text-amber-600 dark:text-amber-400">
      {children}
    </p>
  );
}

export function CommentRulePreview({
  values,
  trackedLinkUrl = null,
}: {
  values: RuleFormValues;
  /** The short address the server built for this rule, or null before it is saved. */
  trackedLinkUrl?: string | null;
}) {
  const uiText = useTranslations('organic');
  const uiLocale = useLocale();
  function sampleComment(values: RuleFormValues): string {
    if (values.matchMode === 'any_comment') return uiText('ruleSampleAny');
    const first = values.keywords[0];
    return first === undefined
      ? uiText('ruleSampleEmpty')
      : uiText('ruleSampleKeyword', { keyword: first });
  }

  function scopeValue(values: RuleFormValues): string {
    if (values.postScope === 'all_posts') return uiText('ruleAllPublished');
    const count = values.platformPostIds.length;
    if (count === 0) return uiText('ruleNoneWatched');
    return uiText('ruleChosenPosts', { count });
  }

  function formatDay(local: string): string {
    const at = new Date(local);
    return Number.isNaN(at.getTime())
      ? local
      : at.toLocaleDateString(uiLocale, { day: 'numeric', month: 'short' });
  }

  function windowValue(values: RuleFormValues): string {
    const from = values.activeFrom.trim();
    const until = values.activeUntil.trim();
    if (from === '' && until === '') return uiText('ruleUntilOff');
    if (from !== '' && until !== '')
      return uiText('ruleFromUntil', {
        from: formatDay(from),
        until: formatDay(until),
      });
    if (from !== '') return uiText('ruleFrom', { date: formatDay(from) });
    return uiText('ruleUntil', { date: formatDay(until) });
  }

  function privateReplyValue(): string {
    const hours = Math.round(PRIVATE_REPLY_COOLDOWN_MINUTES / 60);
    return uiText('rulePrivateFrequency', { hours });
  }

  /**
   * Two facts in one row: how many wordings there are, and that each person gets
   * one reply per post. Stated together because a person who comments twice and
   * sees no second answer reads that as a failure otherwise.
   */
  function publicReplyValue(values: RuleFormValues): string {
    const written = values.publicReplyMessages.filter((message) => message.trim() !== '').length;
    if (written === 0) return uiText('ruleNoPublicReplies');
    return uiText('rulePublicReplyFrequency', { count: written });
  }

  const publicReply = values.publicReplyMessages.find((message) => message.trim() !== '');
  const dmText = values.replyMessage.trim();
  const hasLink = values.destinationUrl.trim() !== '';
  const buttonLabel = values.linkButtonLabel.trim();
  const openable = openableDestination(values.destinationUrl);
  const sendsLinkAsText = hasLink && buttonLabel === '';
  const sendsNothing = publicReply === undefined && dmText === '' && !hasLink;

  return (
    <aside
      aria-label={uiText('preview_of_what_the_commenter_receives_dd69478')}
      className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold leading-none">{uiText('preview_324b134')}</h3>
        <span className="text-2xs leading-none text-muted-foreground">
          {uiText('as_the_app_shows_it_983afe4')}
        </span>
      </div>

      <section className="flex flex-col gap-2 rounded-lg border bg-background p-2.5">
        <SectionLabel>{uiText('in_your_post_s_comments_aaf0235')}</SectionLabel>
        <div className="flex gap-2">
          <Avatar label="@" />
          <div className="min-w-0">
            <p className="text-2xs text-muted-foreground">{COMMENTER_HANDLE}</p>
            <p className="break-words text-xs">{sampleComment(values)}</p>
          </div>
        </div>
        {publicReply === undefined ? (
          <Absence>{uiText('no_public_reply_the_comment_gets_no_visible_a_41339cd')}</Absence>
        ) : (
          <div className="flex gap-2 pl-5">
            <Avatar label={uiText('you_bb0347a')} />
            <div className="min-w-0">
              <p className="text-2xs text-muted-foreground">{uiText('your_account_17a7e5c')}</p>
              <p className="break-words text-xs">{publicReply}</p>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border bg-background p-2.5">
        <SectionLabel>{uiText('in_their_inbox_78bfb7f')}</SectionLabel>
        {dmText === '' && !hasLink ? (
          <Absence>{uiText('no_message_yet_nothing_would_be_sent_privatel_ea791ed')}</Absence>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Avatar label={uiText('you_bb0347a')} />
              <span className="text-2xs text-muted-foreground">
                {uiText('your_account_17a7e5c')}
              </span>
            </div>
            <div className="overflow-hidden rounded-lg rounded-tl-sm bg-muted">
              {dmText === '' && !sendsLinkAsText ? (
                <p className="px-2.5 py-2 text-xs italic text-muted-foreground">
                  {uiText('no_text_the_button_would_arrive_on_its_own_7c32aa4')}
                </p>
              ) : (
                <p className="whitespace-pre-wrap break-words px-2.5 py-2 text-xs">
                  {dmText}
                  {sendsLinkAsText ? (
                    <>
                      {dmText === '' ? null : <br />}
                      <br />
                      {trackedLinkUrl === null ? (
                        <span className="italic text-muted-foreground">
                          {uiText('your_short_link_created_when_you_save_d4abfd9')}
                        </span>
                      ) : (
                        <span className="break-all text-primary">{trackedLinkUrl}</span>
                      )}
                    </>
                  ) : null}
                </p>
              )}
              {hasLink && !sendsLinkAsText ? (
                openable === null ? (
                  <span className="block border-t border-background/60 px-2.5 py-2 text-center text-xs font-medium text-muted-foreground">
                    {buttonLabel === '' ? uiText('open_ed077f3') : buttonLabel}
                  </span>
                ) : (
                  <a
                    href={openable}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={uiText('opens_the_destination_in_a_new_tab_does_not_c_460d353')}
                    className="block border-t border-background/60 px-2.5 py-2 text-center text-xs font-medium text-primary hover:underline"
                  >
                    {buttonLabel === '' ? uiText('open_ed077f3') : buttonLabel}
                  </a>
                )
              ) : null}
            </div>
          </div>
        )}
        {hasLink ? null : (
          <Absence>{uiText('no_link_the_message_goes_out_with_nothing_to__999732c')}</Absence>
        )}
        {hasLink && !sendsLinkAsText ? (
          <Absence>{uiText('the_button_shows_in_the_instagram_app_not_in__ad3d8c9')}</Absence>
        ) : null}
      </section>

      <section className="flex flex-col gap-1.5 rounded-lg border bg-background p-2.5">
        <SectionLabel>{uiText('what_this_rule_does_e142694')}</SectionLabel>
        {values.enabled ? null : (
          <Warning>{uiText('switched_off_none_of_this_is_being_sent_b5d4b9e')}</Warning>
        )}
        {sendsNothing ? (
          <Warning>{uiText('nothing_to_send_this_rule_would_match_a_comme_d0caaea')}</Warning>
        ) : null}
        <dl className="flex flex-col">
          <FactRow label={uiText('watches_0da94d9')}>{scopeValue(values)}</FactRow>
          <FactRow label={uiText('runs_848f54e')}>{windowValue(values)}</FactRow>
          <FactRow label={uiText('public_reply_f7ee06d')}>{publicReplyValue(values)}</FactRow>
          <FactRow label={uiText('direct_message_cd3e160')}>{privateReplyValue()}</FactRow>
        </dl>
      </section>
    </aside>
  );
}
