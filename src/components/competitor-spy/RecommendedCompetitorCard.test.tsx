import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { RecommendedCompetitor } from "@continuum/contracts";
import { RecommendedCompetitorCard } from "./RecommendedCompetitorCard";

const base: RecommendedCompetitor = {
  name: "Acme Co",
  slug: "acme-co",
  instagramHandle: "acme",
  instagramUrl: "https://www.instagram.com/acme",
  website: null,
  facebookUrl: null,
  tiktokUrl: null,
  insight: "Leads with UGC and sustainability messaging.",
  alreadyTracked: false,
};

afterEach(cleanup);

describe("RecommendedCompetitorCard", () => {
  it("renders the name, handle and insight", () => {
    const { getByText } = render(
      <RecommendedCompetitorCard competitor={base} onTrack={() => {}} onDismiss={() => {}} isTracking={false} />,
    );
    expect(getByText("Acme Co")).toBeTruthy();
    expect(getByText("@acme")).toBeTruthy();
    expect(getByText(/sustainability/)).toBeTruthy();
  });

  it("fires onTrack and onDismiss on the respective buttons", () => {
    const onTrack = mock(() => {});
    const onDismiss = mock(() => {});
    const { getByRole } = render(
      <RecommendedCompetitorCard competitor={base} onTrack={onTrack} onDismiss={onDismiss} isTracking={false} />,
    );
    fireEvent.click(getByRole("button", { name: /^track$/i }));
    fireEvent.click(getByRole("button", { name: /dismiss acme co/i }));
    expect(onTrack).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows a Tracked badge and hides the Track button when alreadyTracked", () => {
    const { getByText, queryByRole } = render(
      <RecommendedCompetitorCard
        competitor={{ ...base, alreadyTracked: true }}
        onTrack={() => {}}
        onDismiss={() => {}}
        isTracking={false}
      />,
    );
    expect(getByText("Tracked")).toBeTruthy();
    expect(queryByRole("button", { name: /track/i })).toBeNull();
  });

  it("disables the Track button while a track is in flight", () => {
    const { getByRole } = render(
      <RecommendedCompetitorCard competitor={base} onTrack={() => {}} onDismiss={() => {}} isTracking={true} />,
    );
    const button = getByRole("button", { name: /tracking/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
