import { Clapperboard, GalleryHorizontalEnd, PencilLine, Sparkles } from 'lucide-react';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CreatePostFormat, CreatePostOptions, PlannerPlatformKey } from './planner-platforms';

type AddPostMenuProps = {
  onCreatePost: (options: CreatePostOptions) => void;
  // The styled + trigger, supplied by each call site so per-view density stays intact.
  children: React.ReactNode;
  // Cell menus pass the day/platform they belong to; the toolbar + omits them and
  // the workspace defaults to the first visible day.
  dayId?: string;
  platformKey?: PlannerPlatformKey;
  align?: 'start' | 'center' | 'end';
};

const MANUAL_FORMATS: ReadonlyArray<{
  format: CreatePostFormat;
  label: string;
  hint: string;
  Icon: typeof PencilLine;
}> = [
  { format: 'Post', label: 'New post', hint: 'Single image or text', Icon: PencilLine },
  {
    format: 'Carousel',
    label: 'New carousel',
    hint: 'Multi-slide gallery',
    Icon: GalleryHorizontalEnd,
  },
  { format: 'Reel', label: 'New reel', hint: 'Short-form video', Icon: Clapperboard },
];

// Shared "+" menu for every calendar surface (toolbar + week/month/list cells).
// Primary actions seed a real manual draft with the chosen format, which the user
// edits in the sidebar preview. "Generate with AI" is the secondary agent path.
export const AddPostMenu = React.memo(function AddPostMenu({
  onCreatePost,
  children,
  dayId,
  platformKey,
  align = 'center',
}: AddPostMenuProps) {
  const createManual = React.useCallback(
    (format: CreatePostFormat) => {
      onCreatePost({ dayId, platformKey, status: 'draft', mode: 'manual', format });
    },
    [dayId, platformKey, onCreatePost],
  );

  const handleGenerateWithAi = React.useCallback(() => {
    onCreatePost({ dayId, platformKey, status: 'placeholder', mode: 'ai' });
  }, [dayId, platformKey, onCreatePost]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        {MANUAL_FORMATS.map(({ format, label, hint, Icon }) => (
          <DropdownMenuItem key={format} onSelect={() => createManual(format)}>
            <Icon className="size-4" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleGenerateWithAi}>
          <Sparkles className="size-4" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">Generate with AI</span>
            <span className="text-xs text-muted-foreground">Let the agent draft it</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
