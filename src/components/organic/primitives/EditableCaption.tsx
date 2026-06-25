"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"

const CAPTION_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
}

// All user-supplied text is HTML-escaped before being inserted into the HTML
// string, so dangerouslySetInnerHTML on the mirror div is XSS-safe.
function buildCaptionMirrorHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return escaped
    .replace(/@[^\s\n@&]+/g, '<mark class="mention-token">$&</mark>')
    .replace(/\n/g, "<br>")
}

// A textarea whose @mentions are highlighted by a synced mirror layer behind a
// transparent input. Used only while a caption is actively being edited.
export function InlinePreviewTextarea({
  className,
  value,
  onScroll,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  const mirrorRef = React.useRef<HTMLDivElement>(null)
  const mirrorHtml = React.useMemo(() => buildCaptionMirrorHtml(String(value ?? "")), [value])

  const handleScroll = React.useCallback(
    (e: React.UIEvent<HTMLTextAreaElement>) => {
      if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop
      onScroll?.(e)
    },
    [onScroll],
  )

  const layoutClass = cn("px-3 py-2", className)

  return (
    <div className="relative">
      <div
        ref={mirrorRef}
        aria-hidden
        className={cn(
          layoutClass,
          "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-transparent",
        )}
        dangerouslySetInnerHTML={{ __html: mirrorHtml }}
      />
      <Textarea
        value={value}
        onScroll={handleScroll}
        {...props}
        className={cn(
          "relative resize-none border-border/60 bg-transparent text-foreground placeholder:text-muted-foreground shadow-none focus-visible:ring-1 focus-visible:ring-ring/40",
          className,
        )}
      />
    </div>
  )
}

export function CaptionCharCount({ caption, platform }: { caption: string; platform: string }) {
  const limit = CAPTION_LIMITS[platform] ?? 2200
  const len = caption.length
  return (
    <div className="mt-1 flex justify-end">
      <span
        className={cn(
          "text-2xs tabular-nums",
          len > limit
            ? "text-destructive"
            : len > limit * 0.9
              ? "text-amber-600"
              : "text-muted-foreground/50",
        )}
      >
        {len.toLocaleString()} / {limit.toLocaleString()}
      </span>
    </div>
  )
}

// Read-mode caption: faithful render (mentions highlighted, line breaks kept) so
// what you see is what posts. Visible mirror of the edit layer.
function CaptionReadout({ value }: { value: string }) {
  const html = React.useMemo(() => buildCaptionMirrorHtml(value), [value])
  return (
    <span
      className="whitespace-pre-wrap break-words [&_.mention-token]:bg-transparent [&_.mention-token]:font-semibold [&_.mention-token]:text-primary"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/**
 * Caption that reads as text in its true position inside the platform frame and
 * turns editable in place on click — no always-on textarea. One caption per
 * draft; the platform mock decides the surrounding chrome (brand name, layout).
 */
export function EditableCaption({
  value,
  onChange,
  platform,
  placeholder = "Write a caption…",
  className,
  editClassName,
  ariaLabel = "Caption",
}: {
  value: string
  onChange: (next: string) => void
  platform: string
  placeholder?: string
  className?: string
  editClassName?: string
  ariaLabel?: string
}) {
  const [editing, setEditing] = React.useState(false)

  if (!editing) {
    const hasText = value.trim().length > 0
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={hasText ? `Edit ${ariaLabel.toLowerCase()}` : `Add a ${ariaLabel.toLowerCase()}`}
        className={cn(
          "block w-full rounded-md px-2 py-1.5 text-left text-foreground transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
          className,
        )}
      >
        {hasText ? (
          <CaptionReadout value={value} />
        ) : (
          <span className="text-muted-foreground/50">{placeholder}</span>
        )}
      </button>
    )
  }

  return (
    <div>
      <InlinePreviewTextarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            setEditing(false)
          }
        }}
        autoFocus
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={cn("min-h-[6rem] border-0 bg-transparent p-0 text-sm leading-relaxed focus-visible:ring-0", editClassName)}
      />
      <CaptionCharCount caption={value} platform={platform} />
    </div>
  )
}
