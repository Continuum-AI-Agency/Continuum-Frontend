'use client';

// What would raise the confidence score, in the panel — not only behind the badge's
// hover. The engine names the ad sets under the event floor, the ones whose windows
// disagree, the ones spending with no tracked conversions; each line is a thing a person
// can do this week. Renders nothing for a run recorded before the engine carried them.

import type { RunConfidence } from '@continuum/contracts';
import { explainConfidence } from '../reportModel';

export function ConfidenceActionables({ confidence }: { confidence: RunConfidence | null }) {
  const explanation = explainConfidence(confidence);
  if (!explanation) return null;
  const { actionables, prior } = explanation;
  if (actionables.length === 0 && !prior) return null;
  return (
    <div className="mt-2 space-y-1 border-border/60 border-t pt-2 text-2xs">
      {actionables.length > 0 ? (
        <ul className="space-y-1" data-testid="confidence-actionables">
          {actionables.map((action) => (
            <li className="text-foreground" key={action.code}>
              <span className="font-medium">To raise it:</span> {action.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Nothing is holding the data back this cycle.</p>
      )}
      {prior ? (
        <p className="text-muted-foreground">
          Predictability of this objective: {prior.pct}% — {prior.note}.
        </p>
      ) : null}
    </div>
  );
}
