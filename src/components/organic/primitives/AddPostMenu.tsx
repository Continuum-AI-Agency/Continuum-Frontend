import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  type AddPostAction,
  AddPostActionBody,
  AI_ONE_SHOT_ACTION,
  MANUAL_ADD_POST_ACTIONS,
} from './add-post-actions';
import type { CreatePostOptions, PlannerPlatformKey } from './planner-platforms';

type AddPostMenuProps = {
  onCreatePost: (options: CreatePostOptions) => void;
  // The styled + trigger, supplied by each call site so per-view density stays intact.
  /** Single element: it becomes the menu trigger via Base UI `render`. */
  children: React.ReactElement;
  // Cell menus pass the day/platform they belong to; the toolbar + omits them and
  // the workspace defaults to the first visible day.
  dayId?: string;
  platformKey?: PlannerPlatformKey;
  align?: 'start' | 'center' | 'end';
};

// Shared "+" menu for every calendar surface (toolbar + week/month/list cells).
// Manual actions seed a real editable draft with the chosen format; the AI
// one-shot action opens the AiPostComposer. The action list itself lives in
// add-post-actions so the day-cell right-click menu offers the same set.
export const AddPostMenu = React.memo(function AddPostMenu({
  onCreatePost,
  children,
  dayId,
  platformKey,
  align = 'center',
}: AddPostMenuProps) {
  const select = React.useCallback(
    (options: AddPostAction['options']) => {
      onCreatePost({ dayId, platformKey, ...options });
    },
    [dayId, platformKey, onCreatePost],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={children} />
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => select(AI_ONE_SHOT_ACTION.options)}>
            <AddPostActionBody action={AI_ONE_SHOT_ACTION} />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {MANUAL_ADD_POST_ACTIONS.map((action) => (
            <DropdownMenuItem key={action.id} onSelect={() => select(action.options)}>
              <AddPostActionBody action={action} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
