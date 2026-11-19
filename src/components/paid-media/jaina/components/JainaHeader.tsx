'use client';

import { Archive, Layers, RotateCcw, Target, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ActiveProjectSelect, useActiveProjectOptional } from '@/components/projects';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type JainaHeaderProps = {
  brandName: string;
  campaignId?: string | null;
  adAccountId?: string | null;
  /** False where the host already names the brand and ad account above the chat (the Scale
   *  page's account chip in the app header), so the chat does not repeat them. */
  showAccountScope?: boolean;
  onClearMemory: () => void;
  onClearConversation: () => void;
  onStop: () => void;
  isStreaming: boolean;
};

export function JainaHeader({
  brandName,
  campaignId,
  adAccountId,
  showAccountScope = true,
  onClearMemory,
  onClearConversation,
  onStop,
  isStreaming,
}: JainaHeaderProps) {
  const uiText = useTranslations('scale');
  // Optional: this surface also renders inside the Campaign Canvas, which is not guaranteed
  // to sit under the dashboard shell's ActiveProjectProvider. No provider, no chip — never a
  // thrown hook.
  const projectScope = useActiveProjectOptional();
  return (
    <header className="relative z-10 flex items-center justify-between gap-3 border-b border-border/70 bg-background/70 p-3 transition-all duration-300">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 shrink-0 mr-2">
          <h2 className="text-sm font-semibold tracking-tight whitespace-nowrap">
            {uiText('jaina_15cdaaf')}
          </h2>
          <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        </div>

        <div className="hidden sm:flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
          {showAccountScope && (
            <div className="flex items-center gap-1.5 shrink-0 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              <Archive className="size-3" />
              <span className="truncate max-w-[100px]">{brandName}</span>
            </div>
          )}

          {showAccountScope && adAccountId && (
            <div className="flex items-center gap-1.5 shrink-0 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              <Layers className="size-3" />
              <span className="font-mono truncate max-w-[120px]">{adAccountId}</span>
            </div>
          )}

          {campaignId && (
            <div className="flex items-center gap-1.5 shrink-0 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              <Target className="size-3" />
              <span className="truncate max-w-[120px]">{campaignId}</span>
            </div>
          )}

          {/* The one INTERACTIVE chip in this row: the other three report scope the surface
              was given, this one chooses it. Its trigger renders the selected ProjectChip. */}
          {projectScope && (
            <ActiveProjectSelect className="h-6 shrink-0 border-dashed px-2 text-xs" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                className="hover:bg-white/10"
                aria-label={uiText('clear_memory_0a9b5fe')}
              >
                <RotateCcw />
                <span className="hidden xs:inline">{uiText('memory_c3963ae')}</span>
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{uiText('clear_jaina_s_memory_8432ef6')}</AlertDialogTitle>
              <AlertDialogDescription>
                {uiText('this_will_permanently_erase_jaina_s_memory_fo_ef50cf6')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{uiText('cancel_19766ed')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onClearMemory}
              >
                {uiText('clear_memory_64f0ea3')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                className="hover:bg-white/10"
                aria-label={uiText('clear_conversation_2fe8467')}
              >
                <X />
                <span className="hidden xs:inline">{uiText('clear_83b12c2')}</span>
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{uiText('clear_this_conversation_f907fd6')}</AlertDialogTitle>
              <AlertDialogDescription>
                {uiText('this_will_delete_the_current_conversation_and_c1d8246')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{uiText('cancel_19766ed')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onClearConversation}
              >
                {uiText('clear_conversation_16299ad')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {isStreaming && (
          <Button variant="destructive" size="sm" onClick={onStop} className="animate-pulse">
            {uiText('stop_cae7d57')}
          </Button>
        )}
      </div>
    </header>
  );
}
