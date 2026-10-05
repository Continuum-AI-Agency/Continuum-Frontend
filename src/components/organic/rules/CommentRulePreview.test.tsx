import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { CommentRulePreview } from './CommentRulePreview';
import type { RuleFormValues } from './ruleFormSchema';

afterEach(cleanup);

function values(overrides: Partial<RuleFormValues> = {}): RuleFormValues {
  return {
    postScope: 'all_posts',
    platformPostIds: [],
    keywords: ['price'],
    matchMode: 'contains_word',
    replyMessage: 'Here is the guide you asked about.',
    publicReplyMessages: ['Sent you a DM!'],
    linkButtonLabel: 'Open the guide',
    destinationUrl: 'https://example.com/guide',
    enabled: true,
    activeFrom: '',
    activeUntil: '',
    ...overrides,
  };
}

describe('the sample comment', () => {
  it("is built from the rule's own first trigger word", () => {
    render(<CommentRulePreview values={values({ keywords: ['presupuesto', 'price'] })} />);
    expect(screen.getByText('presupuesto, thanks!')).toBeDefined();
  });

  // A preview that reads correctly for a rule with no trigger words would hide
  // the fact that the rule cannot fire at all.
  it('does not look finished when there are no trigger words', () => {
    render(<CommentRulePreview values={values({ keywords: [] })} />);
    expect(screen.getByText('your trigger word, thanks!')).toBeDefined();
  });

  it('says anything at all for a rule that answers every comment', () => {
    render(<CommentRulePreview values={values({ matchMode: 'any_comment', keywords: [] })} />);
    expect(screen.getByText('Anything at all, thanks!')).toBeDefined();
  });
});

describe('the public reply', () => {
  it('shows the first variation, because that is the one a first commenter gets', () => {
    render(
      <CommentRulePreview
        values={values({ publicReplyMessages: ['Sent!', 'Check your inbox'] })}
      />,
    );
    expect(screen.getByText('Sent!')).toBeDefined();
    expect(screen.queryByText('Check your inbox')).toBeNull();
  });

  it('skips a blank variation rather than drawing an empty reply', () => {
    render(<CommentRulePreview values={values({ publicReplyMessages: ['   ', 'Sent!'] })} />);
    expect(screen.getByText('Sent!')).toBeDefined();
  });

  it('draws the absence when there is no public reply at all', () => {
    render(<CommentRulePreview values={values({ publicReplyMessages: [] })} />);
    expect(screen.getByText(/no visible answer/i)).toBeDefined();
  });
});

describe('the direct message', () => {
  it('shows the message as written', () => {
    render(<CommentRulePreview values={values({ replyMessage: 'Thanks for asking!' })} />);
    expect(screen.getByText('Thanks for asking!')).toBeDefined();
  });

  it('draws the absence when there is neither text nor link', () => {
    render(<CommentRulePreview values={values({ replyMessage: '', destinationUrl: '' })} />);
    expect(screen.getByText(/nothing would be sent privately/i)).toBeDefined();
  });
});

describe('the button', () => {
  it('carries the label the rule gives it', () => {
    render(<CommentRulePreview values={values({ linkButtonLabel: 'Get the guide' })} />);
    expect(screen.getByText('Get the guide')).toBeDefined();
  });

  // One message, not two: the payload we send carries `text` and `buttons`
  // together, so a button drawn outside the bubble would show a conversation
  // that never happens.
  it('sits inside the message bubble, not beside it', () => {
    render(
      <CommentRulePreview
        values={values({ replyMessage: 'Here it is', linkButtonLabel: 'Get the guide' })}
      />,
    );
    const bubble = screen.getByText('Here it is').parentElement;
    expect(bubble?.textContent).toContain('Get the guide');
  });

  // This is the defect the preview exists to catch: a message whose own text
  // said "click the button below" went out with no button.
  it('shows no button when the rule has no link, whatever the label says', () => {
    render(
      <CommentRulePreview
        values={values({ destinationUrl: '', linkButtonLabel: 'Click here!' })}
      />,
    );
    expect(screen.queryByText('Click here!')).toBeNull();
    expect(screen.getByText(/nothing to tap/i)).toBeDefined();
  });

  // The label is what creates the button. With none, the link travels in the
  // text, which is the form that also works on instagram.com.
  it('puts the link in the message when there is no button text', () => {
    render(
      <CommentRulePreview
        values={values({ linkButtonLabel: '', destinationUrl: 'https://example.com/guide' })}
      />,
    );
    expect(screen.getByText('https://example.com/guide')).toBeDefined();
    expect(screen.queryByRole('link')).toBeNull();
  });

  // Only what was observed: the app rendered it, instagram.com on a desktop did
  // not. Whether web fails everywhere was never tested, so the note stops there.
  // Says what works first, and names the client the way a reader would. "Shows"
  // before "may not" so the note reads as a caveat and not as a failure, and
  // "a browser" rather than the domain, which a reader can take to mean
  // Instagram as a whole.
  it('says where the button shows, then where it may not', () => {
    render(<CommentRulePreview values={values({ linkButtonLabel: 'Get it' })} />);
    expect(screen.getByText(/shows in the instagram app; may not in a browser/i)).toBeDefined();
  });

  it('does not name the domain, which a reader would read as all of Instagram', () => {
    render(<CommentRulePreview values={values({ linkButtonLabel: 'Get it' })} />);
    expect(screen.queryByText(/instagram\.com/i)).toBeNull();
  });

  it('says nothing when there is no button to warn about', () => {
    render(<CommentRulePreview values={values({ linkButtonLabel: '' })} />);
    expect(screen.queryByText(/may not in a browser/i)).toBeNull();
  });

  it('keeps the button when a label is given', () => {
    render(<CommentRulePreview values={values({ linkButtonLabel: 'Get it' })} />);
    expect(screen.getByText('Get it')).toBeDefined();
  });

  it('says the button would travel alone when the message has no text', () => {
    render(<CommentRulePreview values={values({ replyMessage: '' })} />);
    expect(screen.getByText(/button would arrive on its own/i)).toBeDefined();
  });
});

describe('what the rule does', () => {
  it('says the rule is off, so the panel never shows a cheerful message for a dead rule', () => {
    render(<CommentRulePreview values={values({ enabled: false })} />);
    expect(screen.getByText(/switched off/i)).toBeDefined();
  });

  it('says nothing about being off when the rule is on', () => {
    render(<CommentRulePreview values={values({ enabled: true })} />);
    expect(screen.queryByText(/switched off/i)).toBeNull();
  });

  it('reads the scope off the rule', () => {
    render(<CommentRulePreview values={values({ postScope: 'all_posts' })} />);
    expect(screen.getByText('Every post you publish')).toBeDefined();
  });

  it('warns when specific posts are chosen but none are picked', () => {
    render(
      <CommentRulePreview values={values({ postScope: 'specific_posts', platformPostIds: [] })} />,
    );
    expect(screen.getByText(/none picked yet/i)).toBeDefined();
  });

  it('counts the chosen posts', () => {
    render(
      <CommentRulePreview
        values={values({ postScope: 'specific_posts', platformPostIds: ['a', 'b'] })}
      />,
    );
    expect(screen.getByText('2 chosen posts')).toBeDefined();
  });

  it('says it runs until switched off when there is no window', () => {
    render(<CommentRulePreview values={values()} />);
    expect(screen.getByText('Until you switch it off')).toBeDefined();
  });

  it('states the window when the rule has one', () => {
    render(
      <CommentRulePreview
        values={values({ activeFrom: '2026-09-22T00:00', activeUntil: '2026-09-25T00:00' })}
      />,
    );
    expect(screen.getByText(/ to /)).toBeDefined();
  });

  // The number comes from the contract, so the screen cannot drift from what the
  // Backend actually enforces.
  it('warns when the rule would match and then do nothing', () => {
    render(
      <CommentRulePreview
        values={values({ publicReplyMessages: [], replyMessage: '', destinationUrl: '' })}
      />,
    );
    expect(screen.getByText(/would match a comment and then do nothing/i)).toBeDefined();
  });

  it('states the public-reply limit, which is invisible everywhere else', () => {
    render(<CommentRulePreview values={values()} />);
    expect(screen.getByText(/once per person on each post/i)).toBeDefined();
  });

  // A row that vanishes makes the block jump and hides the fact it was stating,
  // so the wording changes and the row stays.
  it('says the wording never varies when there is only one reply', () => {
    render(<CommentRulePreview values={values({ publicReplyMessages: ['Sent!'] })} />);
    expect(screen.getByText(/the same reply every time/i)).toBeDefined();
    expect(screen.queryByText(/rotates/i)).toBeNull();
  });

  it('counts the wordings it rotates between', () => {
    render(
      <CommentRulePreview
        values={values({ publicReplyMessages: ['Sent!', 'Check inbox', 'On its way'] })}
      />,
    );
    expect(screen.getByText(/rotates between your 3 replies/i)).toBeDefined();
  });

  it('ignores blank variations when counting', () => {
    render(
      <CommentRulePreview
        values={values({ publicReplyMessages: ['Sent!', '  ', 'Check inbox'] })}
      />,
    );
    expect(screen.getByText(/rotates between your 2 replies/i)).toBeDefined();
  });

  it('keeps the public row even when nothing is posted publicly', () => {
    render(<CommentRulePreview values={values({ publicReplyMessages: [] })} />);
    expect(screen.getByText(/nothing appears under the comment/i)).toBeDefined();
  });

  // The panel must not invent a second name for something the form already calls
  // something else, so these labels repeat the field labels above them.
  it('uses the same words for these as the form fields do', () => {
    render(<CommentRulePreview values={values()} />);
    expect(screen.getByText('Public reply')).toBeDefined();
    expect(screen.getByText('Direct message')).toBeDefined();
  });

  it('names what each limit is about, so a row reads on its own', () => {
    render(<CommentRulePreview values={values({ publicReplyMessages: ['a', 'b'] })} />);
    expect(screen.getByText(/replies, once per person on each post/i)).toBeDefined();
    expect(screen.getByText(/one message per person/i)).toBeDefined();
  });

  it('labels every row, so the block is scanned rather than read', () => {
    render(<CommentRulePreview values={values()} />);
    for (const label of ['Watches', 'Runs', 'Public reply', 'Direct message']) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('states the cooldown in hours', () => {
    render(<CommentRulePreview values={values()} />);
    expect(screen.getByText(/one message per person every 24 hours/i)).toBeDefined();
  });
});

describe('the button as a link', () => {
  // Opening the destination costs nothing and catches a mistyped address. Opening
  // the tracked address would record a click nobody made.
  it('opens the destination in a new tab, not the tracked address', () => {
    render(<CommentRulePreview values={values({ destinationUrl: 'https://example.com/guide' })} />);
    const link = screen.getByRole('link', { name: /open the guide/i });
    expect(link.getAttribute('href')).toBe('https://example.com/guide');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('is not a link while the address is still being typed', () => {
    render(<CommentRulePreview values={values({ destinationUrl: 'htt' })} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Open the guide')).toBeDefined();
  });

  it('refuses a scheme that is not http or https', () => {
    render(<CommentRulePreview values={values({ destinationUrl: 'javascript:alert(1)' })} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('the panel itself', () => {
  // The same message renders a button in the app and none on instagram.com, so
  // a preview that does not say which one it is showing is a claim it cannot back.
  it('says which client it is showing', () => {
    render(<CommentRulePreview values={values()} />);
    expect(screen.getByText(/as the app shows it/i)).toBeDefined();
  });

  it('names the commenter as a role rather than a made-up person', () => {
    render(<CommentRulePreview values={values()} />);
    expect(screen.getByText('@commenter')).toBeDefined();
  });

  // Ambiguous labels were the complaint: "under your post" could read as the
  // caption, and the private half never said whose account was writing.
  it('says where each half appears', () => {
    render(<CommentRulePreview values={values()} />);
    expect(screen.getByText(/in your post’s comments/i)).toBeDefined();
    expect(screen.getByText(/in their inbox/i)).toBeDefined();
  });

  it('gives both names the same weight, because the words already say which is which', () => {
    render(<CommentRulePreview values={values()} />);
    for (const name of screen.getAllByText('your account')) {
      expect(name.className).toContain('text-muted-foreground');
      expect(name.className).not.toContain('text-foreground');
    }
  });

  it('attributes both messages to your account', () => {
    render(<CommentRulePreview values={values()} />);
    expect(screen.getAllByText('your account').length).toBe(2);
  });
});
