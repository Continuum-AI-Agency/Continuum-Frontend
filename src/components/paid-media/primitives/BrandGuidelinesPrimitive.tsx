"use client";

import { FileTextIcon } from "@radix-ui/react-icons";

import { ComingSoonPrimitive } from "./ComingSoonPrimitive";

export function BrandGuidelinesPrimitive() {
  return (
    <ComingSoonPrimitive
      title="Brand Guidelines"
      summary="Coming soon. We’ll wire this into the same primitives surface so teams can reuse tone, visuals, and personas across channels."
      icon={<FileTextIcon />}
    />
  );
}

