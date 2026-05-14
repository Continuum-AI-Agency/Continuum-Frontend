"use client";

import { useEffect, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";
import { useStudioStore } from "@/StudioCanvas/stores/useStudioStore";
import type { StudioNode } from "@/StudioCanvas/types";

const REFERENCE_IMAGE_NODE_ID = "tour-seed-reference-image";
const PROMPT_NODE_ID = "tour-seed-prompt";
const IMAGE_GEN_NODE_ID = "tour-seed-image-gen";

function buildTourSeedNodes(): StudioNode[] {
  return [
    {
      id: REFERENCE_IMAGE_NODE_ID,
      type: "image",
      position: { x: 120, y: 120 },
      data: { image: undefined, aspectRatio: "1:1", isTourSeed: true },
      style: { width: 220, height: 220 },
    } as StudioNode,
    {
      id: PROMPT_NODE_ID,
      type: "string",
      position: { x: 120, y: 400 },
      data: { value: "", isTourSeed: true },
      style: { width: 320, height: 200 },
    } as StudioNode,
    {
      id: IMAGE_GEN_NODE_ID,
      type: "nanoGen",
      position: { x: 560, y: 200 },
      data: {
        model: "nano-banana-2",
        positivePrompt: "",
        aspectRatio: "1:1",
        imageSize: "512px",
        isTourSeed: true,
      },
      style: { width: 400, height: 400 },
    } as StudioNode,
  ];
}

function buildTourSeedEdges(): Edge[] {
  return [
    {
      id: `e-${REFERENCE_IMAGE_NODE_ID}-${IMAGE_GEN_NODE_ID}`,
      source: REFERENCE_IMAGE_NODE_ID,
      sourceHandle: "image",
      target: IMAGE_GEN_NODE_ID,
      targetHandle: "ref-image",
      type: "dataType",
      data: { dataType: "image", pathType: "bezier" },
    },
    {
      id: `e-${PROMPT_NODE_ID}-${IMAGE_GEN_NODE_ID}`,
      source: PROMPT_NODE_ID,
      sourceHandle: "text",
      target: IMAGE_GEN_NODE_ID,
      targetHandle: "prompt",
      type: "dataType",
      data: { dataType: "text", pathType: "bezier" },
    },
  ];
}

export function useSeedTourNodes(): boolean {
  const [seedingSettled, setSeedingSettled] = useState(false);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const { nodes, setNodes, setEdges } = useStudioStore.getState();
    if (nodes.length === 0) {
      setNodes(buildTourSeedNodes());
      setEdges(buildTourSeedEdges());
    }

    setSeedingSettled(true);
  }, []);

  return seedingSettled;
}
