"use client";

import React from "react";

import type { AgentMentionReference } from "@/lib/agent-references";
import { cn } from "@/lib/utils";

const URL_SPLIT_RE = /(https?:\/\/[^\s<>"]+)/;

type MentionifiedTextProps = {
  text: string;
  references?: AgentMentionReference[];
  className?: string;
  linkClassName?: string;
};

function buildMentionSplitRe(references: AgentMentionReference[]): RegExp | null {
  if (!references.length) return null;
  const tokens = [...new Set(references.map((r) => `@${r.label.trim().replace(/\s+/g, " ")}`))];
  tokens.sort((a, b) => b.length - a.length);
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(${escaped.join("|")})`);
}

export function MentionifiedText({
  text,
  references,
  className,
  linkClassName,
}: MentionifiedTextProps) {
  const mentionSplitRe = React.useMemo(
    () => (references?.length ? buildMentionSplitRe(references) : null),
    [references]
  );

  const urlParts = React.useMemo(() => text.split(URL_SPLIT_RE), [text]);

  return (
    <span className={className}>
      {urlParts.flatMap((part, urlIdx) => {
        if (urlIdx % 2 === 1) {
          return (
            <a
              key={`u${urlIdx}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "break-all text-sky-500 underline underline-offset-2 hover:text-sky-400",
                linkClassName
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }

        if (!mentionSplitRe) return [part];

        return part.split(mentionSplitRe).map((seg, mIdx) =>
          mIdx % 2 === 1 ? (
            <mark key={`u${urlIdx}m${mIdx}`} className="mention-chip">
              {seg}
            </mark>
          ) : (
            seg
          )
        );
      })}
    </span>
  );
}
