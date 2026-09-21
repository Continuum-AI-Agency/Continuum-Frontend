import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { SafeMarkdown } from '@/components/ui/SafeMarkdown';

// Streamdown 2.5 defaults `linkSafety` to `{ enabled: true }`, which renders an allowed link
// as a confirm-first `<button>` holding the URL in a closure — no href in the DOM. We turn that
// off: `harden` below already vets every link, and the interstitial costs middle-click, copy-link
// and keyboard navigation, while doing nothing at all in a `mode="static"` render with no JS.
//
// The earlier version of this test asserted only `data-streamdown="link"`, which Streamdown puts
// on BOTH the button and the anchor — so it passed either way and pinned nothing. It now names
// the element, which is the actual decision.
test('SafeMarkdown renders markdown and hardens links', () => {
  const html = renderToStaticMarkup(
    <SafeMarkdown
      content={'Hello **world**\n\n[ok](https://example.com)\n\n[bad](javascript:alert(1))'}
      mode="static"
    />,
  );

  expect(html).toContain('Hello');
  expect(html).toContain('data-streamdown="strong"');
  expect(html).toContain('world');

  // An allowed link is a real anchor a reader can middle-click, copy and tab to.
  const link = html.match(/<(a|button)[^>]*data-streamdown="link"[^>]*>/)?.[0] ?? '';
  expect(link.startsWith('<a ')).toBe(true);
  expect(link).toContain('href="https://example.com/"');
  expect(link).toContain('rel="noopener noreferrer"');
  expect(html).toContain('>ok<');

  // The refused one never becomes a link at all — it is replaced by inert text, and its URL
  // survives only inside the title that explains the refusal.
  expect(html).toContain('Blocked URL: javascript:alert(1)');
  expect(html).not.toContain('href="javascript');
  expect(html.match(/data-streamdown="link"/g)).toHaveLength(1);
});
