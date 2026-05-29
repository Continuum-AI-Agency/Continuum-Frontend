import type {
  BrandReportSection,
  BackendSectionStatus,
  BrandReportEnrichSection,
  BrandReportResult,
  OnboardingReportStructured,
} from "./brand-report";

/**
 * SSE envelope grammar for the brand-report preview stream. Every event carries
 * a `kind` discriminant matching the SSE `event:` line.
 *
 * `seq` mirrors the SSE `id:` envelope header so a subscriber can dedupe / order
 * from the JSON body alone. Monotonically increasing per run.
 *
 * `spark` is "any progress signal" — milestone-shaped when richMode is on,
 * periodic (every ~5s with a rotating label) while a section's underlying LLM
 * call is in flight. Producers guarantee a spark never follows that section's
 * `status: done|error`.
 *
 * `complete` means "the report is renderable", *not* "all work is finished".
 * Audits and first_impression may still be in flight and will surface as
 * `enrich` events afterwards.
 *
 * **FE contract: MERGE `complete.result` over partial state, do not replace.**
 * The snapshot is taken at the moment `complete` fires, which is before audits
 * and first_impression have resolved — those arrive later as `enrich` events.
 * Overwriting state with `complete.result` will blank out anything streamed
 * via prior `data` / `enrich` events.
 *
 * `run` is the handshake — emitted exactly once before any other event.
 * `ping` is a transport-level heartbeat (~10s cadence) the FE may ignore.
 * `structured` carries the post-comprehension structured-report snapshot.
 * `embedding` reports terminal embedding-target lifecycle (post-`complete`).
 */
export type BrandReportProgressEvent =
  | { kind: "run"; run_id: string; reused: boolean; seq?: number }
  | { kind: "ping"; ts?: string | number; seq?: number }
  | { kind: "data"; section: BrandReportSection; data: unknown; seq?: number }
  | { kind: "stream"; section: BrandReportSection; delta: string; seq?: number }
  | {
      kind: "status";
      section: BrandReportSection;
      status: BackendSectionStatus;
      error?: string;
      seq?: number;
    }
  | { kind: "spark"; section: BrandReportSection; label: string; seq?: number }
  | { kind: "structured"; data: OnboardingReportStructured; seq?: number }
  | {
      kind: "embedding";
      target: string;
      status: string;
      error?: string;
      seq?: number;
    }
  | {
      kind: "complete";
      phase: "preview";
      status: "ok" | "partial" | "error";
      result?: BrandReportResult;
      seq?: number;
    }
  | { kind: "enrich"; section: BrandReportEnrichSection; data: unknown; seq?: number }
  | { kind: "error"; message: string; seq?: number };

export type BrandReportProgressEventKind = BrandReportProgressEvent["kind"];

/**
 * Use in an exhaustive switch on `BrandReportProgressEvent['kind']` to force a
 * typecheck error when a new event kind is added without a handler.
 */
export function assertNeverEvent(value: never): never {
  throw new Error(`Unhandled BrandReportProgressEvent kind: ${JSON.stringify(value)}`);
}
