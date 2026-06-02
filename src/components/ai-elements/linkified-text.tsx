"use client";

import { cn } from "@/lib/utils";

const URL_SPLIT_RE = /(https?:\/\/[^\s<>"]+)/g;

type LinkifiedTextProps = {
  text: string;
  className?: string;
  linkClassName?: string;
};

export function LinkifiedText({ text, className, linkClassName }: LinkifiedTextProps) {
  const parts = text.split(URL_SPLIT_RE);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
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
        ) : (
          part
        )
      )}
    </span>
  );
}
