import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { SafeMarkdown } from '@/components/ui/SafeMarkdown';

// This used to assert the safe link kept its `href`. Streamdown 2.5 defaults
// `linkSafety` to `{ enabled: true }`, so an allowed link now renders as a confirm-first
// `<button data-streamdown="link">` that holds the URL in a closure and calls
// `window.open` only after the reader confirms — the href is not in the DOM at all.
// That is a stronger posture than the old pin, not a weaker one, so the pin follows it:
// no raw href for the allowed link, and the `javascript:` URL still refused outright.
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
  // The allowed link survives as a link-safety control carrying its own label.
  expect(html).toContain('data-streamdown="link"');
  expect(html).toContain('>ok<');
  // The refused one never becomes a control at all — it is replaced by inert text.
  expect(html).toContain('Blocked URL: javascript:alert(1)');
  // The refused URL survives only inside the `title` that explains the refusal, and
  // exactly one link control exists — the allowed one.
  expect(html).not.toContain('href="javascript');
  expect(html.match(/data-streamdown="link"/g)).toHaveLength(1);
});
