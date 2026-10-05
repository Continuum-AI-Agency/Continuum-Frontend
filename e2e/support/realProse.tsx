// The REAL prose renderer, for a bench that runs outside the browser.
//
// `JainaProse` reaches Streamdown through `SafeMarkdownLazy` — `next/dynamic` with `ssr: false`,
// which renders nothing at all outside a browser. A bench that swapped in a stub would grade its
// own stub (the unit tests already do that); this loader points the lazy wrapper at the eager
// `SafeMarkdown` it wraps, so the markdown pass that trimmed the spaces beside a mark is the
// real one. KaTeX's stylesheet is the only other thing Bun cannot load, and a render needs none.

import { plugin } from 'bun';

plugin({
  name: 'real-prose',
  setup(build) {
    build.onLoad({ filter: /SafeMarkdownLazy\.tsx$/ }, () => ({
      contents: "export { SafeMarkdown } from './SafeMarkdown';",
      loader: 'tsx',
    }));
    build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
  },
});

/** The visible text of one prose string, rendered the way the chat renders it. */
export async function renderProseText(content: string): Promise<string> {
  const [{ renderToStaticMarkup }, { JainaProse }] = await Promise.all([
    import('react-dom/server'),
    import('@/components/paid-media/jaina/blocks/prose'),
  ]);
  const html = renderToStaticMarkup(<JainaProse content={content} mode="static" />);
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");
}
