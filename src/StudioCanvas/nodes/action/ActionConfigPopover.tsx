// The on-node reach into an op's settings: the gear in the title bar.
//
// It owns the disclosure, never the controls — those are `ActionConfigFields`, shared
// with the selection inspector's action section so both surfaces stay identical.

import type { ActionId } from '@continuum/contracts';
import { Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isOverlayActionId } from '../../utils/actions/overlayOp';
import { ActionConfigFields } from './ActionConfigFields';

export function ActionConfigPopover({
  nodeId,
  actionId,
  config,
}: {
  nodeId: string;
  actionId: ActionId;
  config: Record<string, unknown>;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="nodrag size-5 shrink-0 text-muted-foreground"
            aria-label="Operation settings"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Settings2 className="size-3" />
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className={
          actionId === 'video.subtitles'
            ? 'nodrag nowheel max-h-[70vh] w-[420px] overflow-y-auto'
            : // The burn-in panel is a drag surface, not a field list: it needs a preview big
              // enough to place type on, which a 64-wide column is not.
              actionId === 'image.text'
              ? 'nodrag nowheel max-h-[70vh] w-80 overflow-y-auto'
              : isOverlayActionId(actionId)
                ? 'nodrag nowheel max-h-96 w-72 overflow-y-auto'
                : 'nodrag nowheel max-h-80 w-64 overflow-y-auto'
        }
        onMouseDown={(event) => event.stopPropagation()}
      >
        <ActionConfigFields nodeId={nodeId} actionId={actionId} config={config} />
      </PopoverContent>
    </Popover>
  );
}
