'use client';

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
//   a phone, and did not on instagram.com in a desktop browser. Whether a phone
//   browser also fails was never tested, so the note says "may not" rather than
//   "does not" and must not be sharpened into a claim nobody has checked.
// - It says "in a browser", not "instagram.com". The domain is our word for it;
//   a reader seeing it can take the warning to mean Instagram as a whole, which
//   is both wider than the truth and the opposite of reassuring.
// - The button belongs INSIDE the message. What we send is one message whose
//   payload carries `text` and `buttons` together, so drawing the button as a
//   separate bubble would show a conversation that never happens.
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

function sampleComment(values: RuleFormValues): string {
  if (values.matchMode === 'any_comment') return 'Anything at all, thanks!';
  const first = values.keywords[0];
  return first === undefined ? 'your trigger word, thanks!' : `${first}, thanks!`;
}

function scopeValue(values: RuleFormValues): string {
  if (values.postScope === 'all_posts') return 'Every post you publish';
  const count = values.platformPostIds.length;
  if (count === 0) return 'None picked yet, so nothing is watched';
  return `${count} chosen post${count === 1 ? '' : 's'}`;
}

function formatDay(local: string): string {
  const at = new Date(local);
  return Number.isNaN(at.getTime())
    ? local
    : at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function windowValue(values: RuleFormValues): string {
  const from = values.activeFrom.trim();
  const until = values.activeUntil.trim();
  if (from === '' && until === '') return 'Until you switch it off';
  if (from !== '' && until !== '') return `${formatDay(from)} to ${formatDay(until)}`;
  if (from !== '') return `From ${formatDay(from)}`;
  return `Until ${formatDay(until)}`;
}

function privateReplyValue(): string {
  const hours = Math.round(PRIVATE_REPLY_COOLDOWN_MINUTES / 60);
  return `One message per person every ${hours} hours, however often they comment`;
}

/**
 * Two facts in one row: how many wordings there are, and that each person gets
 * one reply per post. Stated together because a person who comments twice and
 * sees no second answer reads that as a failure otherwise.
 */
function publicReplyValue(values: RuleFormValues): string {
  const written = values.publicReplyMessages.filter((message) => message.trim() !== '').length;
  if (written === 0) return 'None — nothing appears under the comment';
  const wording =
    written === 1 ? 'The same reply every time' : `Rotates between your ${written} replies`;
  return `${wording}, once per person on each post`;
}

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

export function CommentRulePreview({ values }: { values: RuleFormValues }) {
  const publicReply = values.publicReplyMessages.find((message) => message.trim() !== '');
  const dmText = values.replyMessage.trim();
  const hasLink = values.destinationUrl.trim() !== '';
  const buttonLabel = values.linkButtonLabel.trim();
  const openable = openableDestination(values.destinationUrl);
  const sendsLinkAsText = hasLink && buttonLabel === '';
  const linkPreview = values.destinationUrl.trim();
  const sendsNothing = publicReply === undefined && dmText === '' && !hasLink;

  return (
    <aside
      aria-label="Preview of what the commenter receives"
      className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold leading-none">Preview</h3>
        <span className="text-2xs leading-none text-muted-foreground">as the app shows it</span>
      </div>

      <section className="flex flex-col gap-2 rounded-lg border bg-background p-2.5">
        <SectionLabel>In your post’s comments</SectionLabel>
        <div className="flex gap-2">
          <Avatar label="@" />
          <div className="min-w-0">
            <p className="text-2xs text-muted-foreground">{COMMENTER_HANDLE}</p>
            <p className="break-words text-xs">{sampleComment(values)}</p>
          </div>
        </div>
        {publicReply === undefined ? (
          <Absence>No public reply — the comment gets no visible answer.</Absence>
        ) : (
          <div className="flex gap-2 pl-5">
            <Avatar label="you" />
            <div className="min-w-0">
              <p className="text-2xs text-muted-foreground">your account</p>
              <p className="break-words text-xs">{publicReply}</p>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border bg-background p-2.5">
        <SectionLabel>In their inbox</SectionLabel>
        {dmText === '' && !hasLink ? (
          <Absence>No message yet — nothing would be sent privately.</Absence>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Avatar label="you" />
              <span className="text-2xs text-muted-foreground">your account</span>
            </div>
            <div className="overflow-hidden rounded-lg rounded-tl-sm bg-muted">
              {dmText === '' && !sendsLinkAsText ? (
                <p className="px-2.5 py-2 text-xs italic text-muted-foreground">
                  No text — the button would arrive on its own.
                </p>
              ) : (
                <p className="whitespace-pre-wrap break-words px-2.5 py-2 text-xs">
                  {dmText}
                  {sendsLinkAsText ? (
                    <>
                      {dmText === '' ? null : <br />}
                      <br />
                      <span className="break-all text-primary">{linkPreview}</span>
                    </>
                  ) : null}
                </p>
              )}
              {hasLink && !sendsLinkAsText ? (
                openable === null ? (
                  <span className="block border-t border-background/60 px-2.5 py-2 text-center text-xs font-medium text-muted-foreground">
                    {buttonLabel === '' ? 'Open' : buttonLabel}
                  </span>
                ) : (
                  <a
                    href={openable}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Opens the destination in a new tab. Does not count as a click."
                    className="block border-t border-background/60 px-2.5 py-2 text-center text-xs font-medium text-primary hover:underline"
                  >
                    {buttonLabel === '' ? 'Open' : buttonLabel}
                  </a>
                )
              ) : null}
            </div>
          </div>
        )}
        {hasLink ? null : <Absence>No link — the message goes out with nothing to tap.</Absence>}
        {hasLink && !sendsLinkAsText ? (
          <Absence>Shows in the Instagram app; may not in a browser.</Absence>
        ) : null}
      </section>

      <section className="flex flex-col gap-1.5 rounded-lg border bg-background p-2.5">
        <SectionLabel>What this rule does</SectionLabel>
        {values.enabled ? null : <Warning>Switched off — none of this is being sent.</Warning>}
        {sendsNothing ? (
          <Warning>Nothing to send — this rule would match a comment and then do nothing.</Warning>
        ) : null}
        <dl className="flex flex-col">
          <FactRow label="Watches">{scopeValue(values)}</FactRow>
          <FactRow label="Runs">{windowValue(values)}</FactRow>
          <FactRow label="Public reply">{publicReplyValue(values)}</FactRow>
          <FactRow label="Direct message">{privateReplyValue()}</FactRow>
        </dl>
      </section>
    </aside>
  );
}
