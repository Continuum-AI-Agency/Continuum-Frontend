import { CanvasRoomsTabs } from '@/components/ai-studio/CanvasRoomsTabs';
import { CanvasSyncStatus } from '@/components/ai-studio/CanvasSyncStatus';
import type { useCanvasRealtime } from '@/components/ai-studio/hooks/useCanvasRealtime';
import { WorkflowLibrary } from '@/components/ai-studio/WorkflowLibrary';
import { ActiveUsersStack } from '@/components/presence/ActiveUsersStack';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { useApplyBackToPlanner } from '../hooks/useApplyBackToPlanner';
import { LoadWorkflowDialog } from './LoadWorkflowDialog';
import { SaveWorkflowDialog } from './SaveWorkflowDialog';
import { Toolbar } from './Toolbar';

// One fixed-height row held ~11 children that could neither wrap nor shrink, so
// opening the Studio from the planner drew the readiness pill and the
// Back/Apply buttons ON TOP of the workspace tabs (Airtable #224). The row
// wraps now, each group keeps its own line, and the tabs scroll inside their
// own box instead of painting outside the group that holds them.
export function StudioCanvasHeader({
  brandProfileId,
  activeRoomId,
  onRoomChange,
  roomsLoading,
  realtime,
  apply,
}: {
  brandProfileId?: string;
  activeRoomId?: string;
  onRoomChange: (roomId: string | undefined) => void;
  roomsLoading: boolean;
  realtime: ReturnType<typeof useCanvasRealtime>;
  apply: ReturnType<typeof useApplyBackToPlanner>;
}) {
  return (
    // own box instead of painting outside the group that holds them.
    <div
      className="relative z-[100] flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-background px-4 py-2"
      data-testid="studio-canvas-header"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
        <div className="flex shrink-0 items-center gap-2 text-lg font-bold">
          <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
            Continuum
          </span>
          <span className="font-normal text-muted-foreground">Studio</span>
        </div>
        <div className="hidden h-4 w-px bg-border opacity-20 sm:block" />
        <div data-tour-id="studio-multiplayer" className="flex min-w-0 shrink items-center gap-4">
          <div className="flex h-10 items-center rounded-lg border border-primary/20 bg-primary/10 px-2 shadow-[0_0_15px_rgba(90,72,249,0.1)]">
            <CanvasSyncStatus
              status={realtime.status}
              dbStatus={realtime.dbStatus}
              isSaving={realtime.isSaving}
              isCollaborative={realtime.isCollaborative}
              roomsLoading={roomsLoading}
              hasRoom={Boolean(activeRoomId)}
            />
            <div className="mx-1 h-4 w-px bg-primary/20" />
            <ActiveUsersStack
              onlineUsers={realtime.onlineUsers}
              status={realtime.status as never}
            />
          </div>
          <div className="hidden h-4 w-px bg-border opacity-20 sm:block" />
          <CanvasRoomsTabs
            brandProfileId={brandProfileId || ''}
            activeRoomId={activeRoomId}
            onRoomChange={onRoomChange}
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {apply.enabled ? (
          <>
            {apply.applyReadiness && apply.workflowSummaryLabel ? (
              <div className="hidden w-72 max-w-full items-center gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-2 lg:flex">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Badge variant="outline" className="h-5 px-2 text-2xs">
                      {apply.workflowSummaryLabel}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {apply.applyReadiness.label}
                    </span>
                  </div>
                  <Progress
                    value={(apply.applyReadiness.completed / apply.applyReadiness.total) * 100}
                    className="h-1.5"
                  />
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {apply.applyReadiness.detail}
                  </p>
                </div>
              </div>
            ) : null}
            {apply.requiresExplicitSelection ? (
              <Select
                value={apply.selectedLinkedinNodeId ?? undefined}
                onValueChange={(value) => apply.setSelectedLinkedinNodeId(value)}
              >
                <SelectTrigger className="h-9 w-[15rem]">
                  <SelectValue
                    placeholder="Pick one output to apply"
                    items={Object.fromEntries(
                      apply.linkedinImageCandidates.map((candidate, index) => [
                        candidate.nodeId,
                        `Output ${index + 1}`,
                      ]),
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {apply.linkedinImageCandidates.map((candidate, index) => (
                    <SelectItem key={candidate.nodeId} value={candidate.nodeId}>
                      {`Output ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={apply.onReturnToPlanner}>
              Back to Planner
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void apply.onApplyBack();
              }}
              disabled={apply.isApplyingBack || !apply.applyReadiness?.ready}
            >
              {apply.isApplyingBack ? 'Applying...' : 'Apply Back to Planner'}
            </Button>
          </>
        ) : null}
        <LoadWorkflowDialog brandProfileId={brandProfileId} />
        <SaveWorkflowDialog brandProfileId={brandProfileId} roomId={activeRoomId} />
        <WorkflowLibrary />
        <Toolbar />
      </div>
    </div>
  );
}
