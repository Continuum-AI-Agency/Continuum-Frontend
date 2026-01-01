import React from "react";
import { Streamdown, defaultRehypePlugins } from "streamdown";
import { harden } from "rehype-harden";

type SafeMarkdownProps = {
  content: string;
  className?: string;
  isAnimating?: boolean;
  mode?: "streaming" | "static";
};

const getDefaultOrigin = () => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://example.com";
};

const buildSafeRehypePlugins = (defaultOrigin: string) => [
  defaultRehypePlugins.katex,
  [
    harden,
    {
      defaultOrigin,
      allowedProtocols: ["https"],
      allowedLinkPrefixes: ["*"],
      allowedImagePrefixes: [],
      allowDataImages: false,
    },
  ],
];

export function SafeMarkdown({ content, className, isAnimating, mode = "streaming" }: SafeMarkdownProps) {
  if (!content || !content.trim()) return null;

  const rehypePlugins = buildSafeRehypePlugins(getDefaultOrigin());

  return (
    <Streamdown
      className={className}
      isAnimating={isAnimating}
      mode={mode}
      rehypePlugins={rehypePlugins}
    >
      {content}
    </Streamdown>
  );
}
