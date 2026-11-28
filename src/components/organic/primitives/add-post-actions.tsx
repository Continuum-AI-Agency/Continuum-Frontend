import { Clapperboard, GalleryHorizontalEnd, PencilLine, Sparkles } from 'lucide-react';

import type { CreatePostOptions } from './planner-platforms';

// Single source of truth for every calendar create-post surface. The "+" dropdown
// (AddPostMenu) and the day-cell right-click menu (AddPostContextMenu) both render
// these actions, so the two entry points can never drift apart.

export type AddPostAction = {
  id: string;
  label: string;
  hint: string;
  Icon: typeof PencilLine;
  options: Pick<CreatePostOptions, 'status' | 'mode' | 'format'>;
};

export const MANUAL_ADD_POST_ACTIONS: ReadonlyArray<AddPostAction> = [
  {
    id: 'manual-post',
    label: 'New post',
    hint: 'Single image or text',
    Icon: PencilLine,
    options: { status: 'draft', mode: 'manual', format: 'Post' },
  },
  {
    id: 'manual-carousel',
    label: 'New carousel',
    hint: 'Multi-slide gallery',
    Icon: GalleryHorizontalEnd,
    options: { status: 'draft', mode: 'manual', format: 'Carousel' },
  },
  {
    id: 'manual-reel',
    label: 'New reel',
    hint: 'Short-form video',
    Icon: Clapperboard,
    options: { status: 'draft', mode: 'manual', format: 'Reel' },
  },
];

// The one-shot seeding path: opens AiPostComposer preset with the target day and
// platform, which submits to POST /api/organic/agent/posts/one-shot.
export const AI_ONE_SHOT_ACTION: AddPostAction = {
  id: 'ai-one-shot',
  label: 'AI one-shot post',
  hint: 'Let the agent draft it',
  Icon: Sparkles,
  options: { status: 'placeholder', mode: 'ai' },
};

export function AddPostActionBody({ action }: { action: AddPostAction }) {
  return (
    <div className="flex items-center gap-2">
      <action.Icon className="size-4 shrink-0" />
      <div className="flex flex-col">
        <span className="text-sm font-medium">{action.label}</span>
        <span className="text-xs text-muted-foreground">{action.hint}</span>
      </div>
    </div>
  );
}
