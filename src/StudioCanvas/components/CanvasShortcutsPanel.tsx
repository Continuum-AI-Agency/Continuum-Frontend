import { Keyboard } from 'lucide-react';

import { Panel } from '@/components/ai-elements/panel';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// The canvas keymap, mirrored from useCanvasKeyboardShortcuts. Static by design —
// there is no shortcut registry to derive it from, so the two are kept in step by hand.
export function CanvasShortcutsPanel() {
  return (
    <Panel position="bottom-center" className="border-none bg-transparent p-0 shadow-none">
      <Popover>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-2 bg-background/90 px-2.5 text-xs text-muted-foreground shadow-sm backdrop-blur"
              aria-label="Show canvas keyboard shortcuts"
            >
              <Keyboard className="h-3.5 w-3.5" />
              Shortcuts
            </Button>
          }
        />
        <PopoverContent align="center" side="top" className="w-64 p-3">
          <p className="mb-2 text-xs font-medium text-foreground">Canvas shortcuts</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
            {[
              ['Copy selected nodes', '⌘ C'],
              ['Paste nodes', '⌘ V'],
              ['Cut selected nodes', '⌘ X'],
              ['Delete selected nodes', 'Delete'],
              ['Pan mode', 'H'],
              ['Select mode', 'V'],
              ['Fit view', 'Shift F'],
            ].map(([label, shortcut]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs text-foreground">
                    {shortcut}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </PopoverContent>
      </Popover>
    </Panel>
  );
}
