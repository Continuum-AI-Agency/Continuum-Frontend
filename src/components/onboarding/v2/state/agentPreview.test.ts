import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { OnboardingPreviewEvent } from "@/lib/onboarding/agentClient";

const runOnboardingPreviewMock = mock<
  (options: {
    payload: { brandProfile: unknown; runContext: unknown; scrape: unknown };
    signal?: AbortSignal;
    onEvent?: (event: OnboardingPreviewEvent) => void;
    onRunId?: (runId: string | null) => void;
  }) => Promise<{ runId: string | null; brandProfile?: unknown; structured?: unknown; complete?: unknown }>
>(async () => ({ runId: null }));

const resumeOnboardingPreviewMock = mock<
  (
    runId: string,
    options: {
      onEvent?: (event: OnboardingPreviewEvent) => void;
      lastEventId?: number;
      signal?: AbortSignal;
    }
  ) => Promise<{ brandProfile?: unknown; structured?: unknown; complete?: unknown }>
>(async () => ({}));

mock.module("@/lib/onboarding/agentClient", () => ({
  runOnboardingPreview: runOnboardingPreviewMock,
  resumeOnboardingPreview: resumeOnboardingPreviewMock,
}));

import { runAgentPreview, emptyBuckets } from "@/components/onboarding/v2/state/agentPreview";

const makeInput = () => ({
  brandId: "brand-1",
  userId: "user-1",
  brandName: "Acme",
  websiteUrl: "https://acme.com",
  voiceTags: [] as string[],
  scrape: null,
  onUpdate: mock(() => {}),
});

describe("runAgentPreview", () => {
  beforeEach(() => {
    runOnboardingPreviewMock.mockReset();
    resumeOnboardingPreviewMock.mockReset();
  });

  it("aggregates voice/audience/business buckets from sequential events", async () => {
    runOnboardingPreviewMock.mockImplementation(async ({ onEvent, onRunId }) => {
      onRunId?.("run-1");
      onEvent?.({ type: "voice", payload: { tone: "Witty" } });
      onEvent?.({ type: "audience", payload: { summary: "Mid-market SaaS founders" } });
      onEvent?.({ type: "business", payload: { business_description: "B2B analytics platform" } });
      onEvent?.({ type: "complete", phase: "preview", status: "ok", result: { prompt_version: 1 } });
      return { runId: "run-1" };
    });

    const input = makeInput();
    const outcome = await runAgentPreview(input, new AbortController().signal);

    expect(outcome.runId).toBe("run-1");
    expect(outcome.buckets.voice?.tone).toBe("Witty");
    expect(outcome.buckets.audience?.summary).toBe("Mid-market SaaS founders");
    expect(outcome.buckets.business?.business_description).toBe("B2B analytics platform");
    expect(input.onUpdate).toHaveBeenCalled();
  });

  it("captures first_impression + spark events", async () => {
    runOnboardingPreviewMock.mockImplementation(async ({ onEvent }) => {
      onEvent?.({ type: "first_impression", payload: { headline: "Acme, decoded." } });
      onEvent?.({ type: "spark", section: "voice", label: "Found 5 personality adjectives" });
      onEvent?.({ type: "voice", payload: { tone: "Bold" } });
      onEvent?.({ type: "complete", phase: "preview", status: "ok", result: undefined });
      return { runId: null };
    });

    const outcome = await runAgentPreview(makeInput(), new AbortController().signal);

    expect(outcome.buckets.firstImpression?.headline).toBe("Acme, decoded.");
    expect(outcome.buckets.latestSpark?.section).toBe("voice");
    expect(outcome.buckets.latestSpark?.label).toBe("Found 5 personality adjectives");
  });

  it("appends stream deltas to the matching section accumulator", async () => {
    runOnboardingPreviewMock.mockImplementation(async ({ onEvent }) => {
      onEvent?.({ type: "stream", section: "voice", delta: "Bold," });
      onEvent?.({ type: "stream", section: "voice", delta: " confident," });
      onEvent?.({ type: "stream", section: "audience", delta: "Mid-market." });
      onEvent?.({ type: "voice", payload: { tone: "Bold" } });
      onEvent?.({ type: "complete", phase: "preview", status: "ok", result: undefined });
      return { runId: null };
    });

    const outcome = await runAgentPreview(makeInput(), new AbortController().signal);
    expect(outcome.buckets.voiceStream).toBe("Bold, confident,");
    expect(outcome.buckets.audienceStream).toBe("Mid-market.");
  });

  it("throws when no buckets are populated", async () => {
    runOnboardingPreviewMock.mockImplementation(async () => ({ runId: null }));
    await expect(runAgentPreview(makeInput(), new AbortController().signal)).rejects.toThrow(
      /no data/i
    );
  });

  it("emptyBuckets returns a fully-zeroed shape", () => {
    const b = emptyBuckets();
    expect(b.voice).toBeNull();
    expect(b.firstImpression).toBeNull();
    expect(b.latestSpark).toBeNull();
    expect(b.voiceStream).toBe("");
    expect(b.result).toBeNull();
  });

  it("forwards scrape to runOnboardingPreview", async () => {
    runOnboardingPreviewMock.mockImplementation(async ({ onEvent }) => {
      onEvent?.({ type: "voice", payload: { tone: "Calm" } });
      onEvent?.({ type: "complete", phase: "preview", status: "ok", result: undefined });
      return { runId: "run-2" };
    });

    const input = {
      ...makeInput(),
      scrape: {
        url: "https://acme.com",
        title: "Acme",
        description: null,
        logoUrl: null,
        colors: ["#0b1220"],
        typography: { primary: null, secondary: null },
      },
    };

    await runAgentPreview(input, new AbortController().signal);

    const call = runOnboardingPreviewMock.mock.calls[0]?.[0];
    expect((call?.payload?.scrape as { url: string } | null)?.url).toBe("https://acme.com");
  });

  it("calls resumeOnboardingPreview when resumeRunId is supplied", async () => {
    resumeOnboardingPreviewMock.mockImplementation(async (_runId, { onEvent }) => {
      onEvent?.({ type: "voice", payload: { tone: "Resumed" } });
      onEvent?.({ type: "complete", phase: "preview", status: "ok", result: undefined });
      return {};
    });

    const input = { ...makeInput(), resumeRunId: "run-existing", resumeLastEventId: 5 };
    const outcome = await runAgentPreview(input, new AbortController().signal);

    expect(outcome.runId).toBe("run-existing");
    expect(outcome.buckets.voice?.tone).toBe("Resumed");
    expect(runOnboardingPreviewMock).not.toHaveBeenCalled();
    expect(resumeOnboardingPreviewMock).toHaveBeenCalledWith(
      "run-existing",
      expect.objectContaining({ lastEventId: 5 })
    );
  });
});
