import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import type React from 'react';
import { harden } from 'rehype-harden';
import { Streamdown } from 'streamdown';
import 'katex/dist/katex.min.css';

type SafeMarkdownProps = {
  content: string;
  className?: string;
  isAnimating?: boolean;
  mode?: 'streaming' | 'static';
};

const getDefaultOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://example.com';
};

// Module constants, not literals in the render. Streamdown memoizes per markdown block, and both
// its own memo and each block's compare `plugins`/`rehypePlugins` BY IDENTITY: a fresh literal per
// render re-parsed every block of a streaming answer on every chunk (2,359 wasted block renders on
// a 40-delta answer), not just the tail that changed. The origin is per page, so it is fixed too.
const PLUGINS: React.ComponentProps<typeof Streamdown>['plugins'] = { math, code, mermaid, cjk };
// Streamdown 2.5 turned link safety ON by default, which renders EVERY markdown link as a
// confirm-first <button> holding the url in a closure — no href in the DOM. That default is the
// library's, not ours, and it reaches all 54 call sites including Jaina's chat: it costs
// middle-click, copy-link and keyboard navigation, and in a `mode="static"` render with no JS the
// button does nothing at all. The `harden` plugin below is what actually polices links here — it
// already restricts protocols to https and forbids data images — so the interstitial adds a
// confirmation step on top of a link that was already vetted.
const LINK_SAFETY: React.ComponentProps<typeof Streamdown>['linkSafety'] = { enabled: false };
const REHYPE_PLUGINS: React.ComponentProps<typeof Streamdown>['rehypePlugins'] = [
  [
    harden,
    {
      defaultOrigin: getDefaultOrigin(),
      allowedProtocols: ['https'],
      allowedLinkPrefixes: ['*'],
      allowedImagePrefixes: [],
      allowDataImages: false,
    },
  ],
];

export function SafeMarkdown({
  content,
  className,
  isAnimating,
  mode = 'streaming',
}: SafeMarkdownProps) {
  if (!content || !content.trim()) return null;

  return (
    <Streamdown
      className={className}
      isAnimating={isAnimating}
      mode={mode}
      linkSafety={LINK_SAFETY}
      plugins={PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
    >
      {content}
    </Streamdown>
  );
}
