// Pure derivation of the canvas sync-status indicator. Kept separate from the
// component so the precedence rules are unit-testable and the UI stays a dumb switch.
//
// Why this exists: the old indicator switched directly on the realtime channel
// status and treated the initial "INITIALIZING" as "Connecting…". When a brand had
// no workspace, no channel ever subscribed, so the status was stuck on INITIALIZING
// forever and the pill spun indefinitely. Here, "no workspace yet" and "still loading
// the workspace list" are first-class states distinct from realtime "connecting", so
// the spinner only shows during a genuine connection attempt against a real room.

export type RealtimeStatus = 'INITIALIZING' | 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'ERROR';

export type CanvasConnectionState =
  | 'workspace-loading'
  | 'idle'
  | 'connecting'
  | 'saving'
  | 'connected'
  | 'saved-locally'
  | 'sync-error'
  | 'live-disconnected';

export interface CanvasConnectionInputs {
  roomsLoading: boolean;
  hasRoom: boolean;
  status: RealtimeStatus;
  dbStatus: RealtimeStatus;
  isSaving: boolean;
  isCollaborative: boolean;
}

export function deriveCanvasConnectionState(inputs: CanvasConnectionInputs): CanvasConnectionState {
  const { roomsLoading, hasRoom, status, dbStatus, isSaving, isCollaborative } = inputs;

  // No active workspace: never a realtime "connecting" — there is nothing to connect
  // to. Distinguish "rooms list still loading" from a settled "no workspace" idle.
  if (!hasRoom) {
    return roomsLoading ? 'workspace-loading' : 'idle';
  }

  const dbDegraded = dbStatus === 'ERROR' || dbStatus === 'TIMED_OUT' || dbStatus === 'CLOSED';
  const presenceDegraded = status === 'ERROR';

  // Only alarm when collaborating: a dropped channel means peers may diverge.
  if (isCollaborative && dbDegraded) return 'sync-error';
  if (isCollaborative && presenceDegraded) return 'live-disconnected';

  if (isSaving) return 'saving';

  // Solo with a degraded channel is harmless: edits are local-authoritative and
  // still persist. Calm offline state instead of an alarming error.
  if (!isCollaborative && (dbDegraded || presenceDegraded)) return 'saved-locally';

  if (dbStatus === 'INITIALIZING' || status === 'INITIALIZING') return 'connecting';

  return 'connected';
}
