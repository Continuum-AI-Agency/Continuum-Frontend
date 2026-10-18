'use client';

import {
  Clapperboard,
  Copy,
  Hash,
  Info,
  MoreHorizontal,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
} from 'lucide-react';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DuplicateDayPicker } from './DuplicateDayPicker';

/** A menu entry the parent may offer disabled; the reason is shown in the item, as text. */
export type PostMenuAction = {
  label: string;
  onSelect: () => void;
  disabledReason?: string | null;
};

const iconClass = 'mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground';

function ActionItem({ action, icon }: { action: PostMenuAction; icon: React.ReactNode }) {
  const reason = action.disabledReason ?? null;
  return (
    <DropdownMenuItem onSelect={action.onSelect} disabled={reason !== null}>
      {icon}
      <span className="flex min-w-0 flex-col">
        <span>{action.label}</span>
        {reason && <span className="text-2xs leading-snug text-muted-foreground">{reason}</span>}
      </span>
    </DropdownMenuItem>
  );
}

/**
 * The review panel's ONE secondary-action menu. Approve and Publish are deliberately absent:
 * they live in the footer, and a second copy here is what made the old header unreadable.
 * Presentational — the parent wires and gates every action.
 */
export function PostCommandMenu({
  onOpenInStudio,
  mediaAction,
  renderAction,
  onShowDetails,
  onPlatformOptions,
  onEditCreativeDirection,
  onEditHashtags,
  onDuplicate,
  onMoveBackToDraft,
  onDelete,
}: {
  onOpenInStudio?: PostMenuAction;
  /** The next media step: generate, sketch a blueprint, or realize one. */
  mediaAction?: PostMenuAction;
  /** Stitch a composed reel into its final video. */
  renderAction?: PostMenuAction;
  onShowDetails: () => void;
  onPlatformOptions?: () => void;
  onEditCreativeDirection: () => void;
  onEditHashtags: () => void;
  /** Clone this post onto another day. Same picker the calendar card uses. */
  onDuplicate?: (dayId: string) => void;
  /** Only offered while the post is scheduled. */
  onMoveBackToDraft?: () => void;
  onDelete: () => void;
}) {
  const [isDuplicateOpen, setIsDuplicateOpen] = React.useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Post actions"
            className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50 before:absolute before:-inset-1.5 before:content-['']"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        {(onOpenInStudio || mediaAction || renderAction) && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Create</DropdownMenuLabel>
              {mediaAction && (
                <ActionItem action={mediaAction} icon={<Wand2 className={iconClass} />} />
              )}
              {renderAction && (
                <ActionItem action={renderAction} icon={<Clapperboard className={iconClass} />} />
              )}
              {onOpenInStudio && (
                <ActionItem action={onOpenInStudio} icon={<Sparkles className={iconClass} />} />
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuGroup>
          <DropdownMenuLabel>Edit</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onEditHashtags}>
            <Hash className={iconClass} />
            Hashtags
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEditCreativeDirection}>
            <Sparkles className={iconClass} />
            Creative direction
          </DropdownMenuItem>
          {onPlatformOptions && (
            <DropdownMenuItem onSelect={onPlatformOptions}>
              <SlidersHorizontal className={iconClass} />
              Platform options
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onShowDetails}>
            <Info className={iconClass} />
            Details
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {onDuplicate && (
          <DropdownMenuSub open={isDuplicateOpen} onOpenChange={setIsDuplicateOpen}>
            <DropdownMenuSubTrigger>
              <Copy className={iconClass} />
              Duplicate…
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-auto p-3">
              <DuplicateDayPicker
                onSelect={(dayId) => {
                  onDuplicate(dayId);
                  setIsDuplicateOpen(false);
                }}
                onCancel={() => setIsDuplicateOpen(false)}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {onMoveBackToDraft && (
          <DropdownMenuItem onSelect={onMoveBackToDraft}>
            <Undo2 className={iconClass} />
            Move back to draft
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete draft
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
