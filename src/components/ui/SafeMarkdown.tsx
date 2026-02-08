import React from "react";
import { Streamdown } from "streamdown";
import { harden } from "rehype-harden";
import { math } from "@streamdown/math";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { cjk } from "@streamdown/cjk";
import "katex/dist/katex.min.css";

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

export function SafeMarkdown({
  content,
  className,
  isAnimating,
  mode = "streaming",
}: SafeMarkdownProps) {
  if (!content || !content.trim()) return null;

  const defaultOrigin = getDefaultOrigin();

  return (
    <Streamdown
      className={className}
      isAnimating={isAnimating}
      mode={mode}
      plugins={{
        math,
        code,
        mermaid,
        cjk,
      }}
      rehypePlugins={[
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
      ]}
    >
      {content}
    </Streamdown>
  );
}
