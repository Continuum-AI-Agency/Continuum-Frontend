import { beforeEach, describe, expect, it } from "bun:test";
import type { Position } from "@xyflow/react";

import { type CampaignCanvasNode } from "../types";
import { useCampaignStore } from "./useCampaignStore";

function createAdSetNode(id: string, position: Position): CampaignCanvasNode {
  return {
    id,
    type: "ad-set",
    position,
    data: {
      label: "Primary Ad Set",
      optimizationGoal: "CONVERSIONS",
      billingEvent: "IMPRESSIONS",
      validationStatus: "valid",
    },
  };
}

describe("useCampaignStore.addConnectedNode", () => {
  beforeEach(() => {
    useCampaignStore.setState({
      nodes: [],
      edges: [],
      history: [],
      redoStack: [],
      edgeStyle: "curved",
    });
  });

  it("attaches an audience node below the ad set", () => {
    useCampaignStore.setState({
      nodes: [createAdSetNode("adset-1", { x: 120, y: 200 })],
    });

    useCampaignStore.getState().addConnectedNode("adset-1", "audience");
    const state = useCampaignStore.getState();
    const audienceNode = state.nodes.find((node) => node.type === "audience");

    expect(audienceNode).toBeTruthy();
    expect(audienceNode?.position).toEqual({ x: 120, y: 500 });
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]?.source).toBe("adset-1");
    expect(state.edges[0]?.target).toBe(audienceNode?.id);
  });

  it("stacks non-audience children below the parent", () => {
    useCampaignStore.setState({
      nodes: [createAdSetNode("adset-1", { x: 120, y: 200 })],
    });

    useCampaignStore.getState().addConnectedNode("adset-1", "ad");
    const state = useCampaignStore.getState();
    const adNode = state.nodes.find((node) => node.type === "ad");

    expect(adNode).toBeTruthy();
    expect(adNode?.position).toEqual({ x: 120, y: 500 });
  });

  it("offsets sibling children horizontally while keeping top-down flow", () => {
    useCampaignStore.setState({
      nodes: [createAdSetNode("adset-1", { x: 120, y: 200 })],
    });

    const store = useCampaignStore.getState();
    store.addConnectedNode("adset-1", "ad");
    store.addConnectedNode("adset-1", "audience");

    const state = useCampaignStore.getState();
    const adNodes = state.nodes.filter((node) => node.id !== "adset-1");
    const positions = adNodes.map((node) => node.position);

    expect(positions).toContainEqual({ x: 120, y: 500 });
    expect(positions).toContainEqual({ x: -60, y: 500 });
  });

  it("validates structure against graph rules and canonical payload schema", () => {
    useCampaignStore.setState({
      nodes: [
        {
          id: "campaign-1",
          type: "campaign",
          position: { x: 100, y: 100 },
          data: {
            label: "Campaign 1",
            objective: "OUTCOME_SALES",
            buyingType: "AUCTION",
            specialAdCategories: [],
            validationStatus: "valid",
          },
        },
      ],
      edges: [],
    });

    const result = useCampaignStore.getState().validateGraph();

    expect(result.payloadValid).toBe(true);
    expect(result.invalidNodeCount).toBe(0);
    expect(result.payloadError).toBeUndefined();
  });
});
