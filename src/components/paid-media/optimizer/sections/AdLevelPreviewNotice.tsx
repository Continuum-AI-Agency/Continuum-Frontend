'use client';

// A standing disclaimer while ad-level optimization is PREVIEW.
//
// The optimizer can now read the creatives INSIDE an ad set — it finds the winner, names the
// ad that is dragging the set down, and tells you when an ad set has nothing to learn from.
// Those findings are real, measured, and safe to act on by hand.
//
// What it CANNOT yet do is act on them: nothing drains an approved ad-level recommendation
// into the Meta pause/unpause writer, and the autopilot path is not built. So the queue can
// show you a burning ad and cannot put it out.
//
// This notice exists so nobody mistakes a queue that looks handled for an account that IS
// handled. It is one component in one file on purpose: DELETE IT in the PR that lands the
// drain + autopilot path, and delete NOT_YET_EXECUTABLE_KINDS with it.

import { TriangleAlertIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function AdLevelPreviewNotice() {
  return (
    <Alert
      // Not `destructive`: nothing is broken and nothing is at risk. This is a limit, and it
      // should read as a limit — a red alarm here would cry wolf next to the real ones.
      className="border-amber-500/40 bg-amber-500/5 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-500"
    >
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle className="font-semibold">
        Ad-level optimization is preview — not fully implemented yet
      </AlertTitle>
      <AlertDescription className="text-muted-foreground">
        <p>
          The optimizer can now see the individual creatives inside an ad set: which one is winning,
          which one is burning the budget, and when an ad set has too few creatives to learn
          anything from. Those findings are measured and real.
        </p>
        <p className="mt-1.5">
          It cannot <strong className="font-medium text-foreground">act</strong> on them yet.
          Pausing an ad, and generating variations of a winner, still have to be done by hand — in
          Meta and in AI Studio. Approving an ad-level recommendation here will tell you so rather
          than pretend it worked.
        </p>
      </AlertDescription>
    </Alert>
  );
}
