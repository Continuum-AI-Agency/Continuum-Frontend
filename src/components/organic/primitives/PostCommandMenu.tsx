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
import { useTranslations } from 'next-intl';
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
  const uiText = useTranslations('organic');
  const [isDuplicateOpen, setIsDuplicateOpen] = React.useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={uiText('post_actions_fd24241')}
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
              <DropdownMenuLabel>{uiText('create_4759498')}</DropdownMenuLabel>
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
          <DropdownMenuLabel>{uiText('edit_464c4ff')}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onEditHashtags}>
            <Hash className={iconClass} />
            {uiText('hashtags_eb48566')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEditCreativeDirection}>
            <Sparkles className={iconClass} />
            {uiText('creative_direction_955fe28')}
          </DropdownMenuItem>
          {onPlatformOptions && (
            <DropdownMenuItem onSelect={onPlatformOptions}>
              <SlidersHorizontal className={iconClass} />
              {uiText('platform_options_71c8f32')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onShowDetails}>
            <Info className={iconClass} />
            {uiText('details_45989de')}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {onDuplicate && (
          <DropdownMenuSub open={isDuplicateOpen} onOpenChange={setIsDuplicateOpen}>
            <DropdownMenuSubTrigger>
              <Copy className={iconClass} />
              {uiText('duplicate_5d20220')}
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
            {uiText('move_back_to_draft_00ade9c')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          {uiText('delete_draft_4649537')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
