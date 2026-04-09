"use client"

import { Cross2Icon } from "@radix-ui/react-icons"
import { AnimatePresence, motion } from "motion/react"

import { Button } from "@/components/ui/button"
import { OrganicDraftPreview } from "./OrganicDraftPreview"
import type { OrganicCalendarDraft } from "./types"

const previewTransition = {
  type: "spring" as const,
  stiffness: 380,
  damping: 32,
  mass: 0.8,
}

type DraftPreviewPanelProps = {
  selectedDraft: OrganicCalendarDraft | null
  brandName?: string
  brandProfileId?: string
  onOpenInAiStudio: () => void
  onClose: () => void
  onApprove: (draftId: string) => void
}

export function DraftPreviewPanel({
  selectedDraft,
  brandName,
  brandProfileId,
  onOpenInAiStudio,
  onClose,
  onApprove,
}: DraftPreviewPanelProps) {
  return (
    <AnimatePresence initial={false}>
      {selectedDraft ? (
        <motion.aside
          key="preview-panel"
          layout
          initial={{ opacity: 0, x: 28, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 24, scale: 0.98 }}
          transition={previewTransition}
          className="flex h-[55dvh] min-h-[22rem] flex-col overflow-hidden rounded-lg bg-card/80 p-2 ring-1 ring-border/45 lg:h-full lg:w-[42rem] lg:shrink-0 xl:w-[46rem]"
        >
          <div className="mb-2 flex shrink-0 items-center justify-between pb-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Post Preview
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!brandProfileId}
                onClick={onOpenInAiStudio}
              >
                Open in AI Studio
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Close preview"
                onClick={onClose}
              >
                <Cross2Icon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-md bg-background/85">
            <div className="h-full overflow-hidden rounded-md border border-border/45 bg-background/80">
              <OrganicDraftPreview
                draft={selectedDraft}
                brandName={brandName}
                brandProfileId={brandProfileId}
                onApprove={onApprove}
              />
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
