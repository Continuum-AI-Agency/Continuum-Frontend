import * as React from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  type AddPostAction,
  AddPostActionBody,
  AI_ONE_SHOT_ACTION,
  MANUAL_ADD_POST_ACTIONS,
} from './add-post-actions';
import { makeCalendarDay } from './calendar-utils';
import type { CreatePostOptions, PlannerPlatformKey } from './planner-platforms';

type AddPostContextMenuProps = {
  onCreatePost: (options: CreatePostOptions) => void;
  // The day surface being wrapped — must be a single element that accepts a ref
  // (Radix Trigger asChild), e.g. the planner/month day cell div.
  children: React.ReactNode;
  dayId: string;
  platformKey?: PlannerPlatformKey;
  platformLabel?: string;
};

// Right-click twin of the "+" AddPostMenu: the same shared action list, anchored
// to a specific day (and platform when the cell implies one). Draft cards inside
// the cell keep their own context menu — their trigger preventDefaults the
// contextmenu event, which this outer Radix trigger honors and stays closed.
export const AddPostContextMenu = React.memo(function AddPostContextMenu({
  onCreatePost,
  children,
  dayId,
  platformKey,
  platformLabel,
}: AddPostContextMenuProps) {
  const select = React.useCallback(
    (options: AddPostAction['options']) => {
      onCreatePost({ dayId, platformKey, ...options });
    },
    [dayId, platformKey, onCreatePost],
  );

  const heading = React.useMemo(() => {
    const day = makeCalendarDay(dayId);
    const dayLabel = day.label && day.dateLabel ? `${day.label}, ${day.dateLabel}` : dayId;
    return platformLabel ? `${dayLabel} · ${platformLabel}` : dayLabel;
  }, [dayId, platformLabel]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel className="text-xs text-muted-foreground">{heading}</ContextMenuLabel>
        <ContextMenuItem onSelect={() => select(AI_ONE_SHOT_ACTION.options)}>
          <AddPostActionBody action={AI_ONE_SHOT_ACTION} />
        </ContextMenuItem>
        <ContextMenuSeparator />
        {MANUAL_ADD_POST_ACTIONS.map((action) => (
          <ContextMenuItem key={action.id} onSelect={() => select(action.options)}>
            <AddPostActionBody action={action} />
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
});
