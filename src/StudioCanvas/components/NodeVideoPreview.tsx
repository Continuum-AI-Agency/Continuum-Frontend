'use client';

import { Video } from '@/components/ui/video';
import { cn } from '@/lib/utils';

/**
 * The generated-clip preview every video-producing node renders.
 *
 * One component because the generator blocks kept drifting copies of a player.
 * Watching a clip — on a node and in the dialogs that open one — goes through
 * the Kobra player (`components/ui/video.tsx`, installed from `@kobra/video`).
 *
 * The BOX carries the aspect ratio (see useSnapToVideoAspect) and the picture
 * fills it with `object-contain`: sizing the preview from its own ratio is the
 * bug that read as extreme zoom in Airtable #232. The player's own `aspect-video`
 * stays in the class list (Loomix does not merge), so the override is `aspect-auto!`.
 * A 9:16 clip then letterboxes inside the node instead of forcing it landscape.
 *
 * `nodrag` on the controls only — scrubbing must not drag the node, while the
 * picture itself stays a drag surface so the node can still be moved by it.
 */
const CANVAS_PLAYER = [
  'aspect-auto! h-full w-full rounded-none border-0 bg-black/85',
  '[&_button]:nodrag [&_button]:nowheel',
  '[&_.pointer-events-auto]:nodrag [&_.pointer-events-auto]:nowheel',
].join(' ');

export function NodeVideoPreview({
  src,
  className,
  children,
  'data-testid': testId,
}: {
  src: string;
  className?: string;
  children?: React.ReactNode;
  'data-testid'?: string;
}) {
  return (
    <div
      className="relative flex h-full w-full"
      data-testid={testId ?? 'studio-node-video-preview'}
    >
      <Video src={src} ariaLabel="Generated clip" className={cn(CANVAS_PLAYER, className)} />
      {children}
    </div>
  );
}
