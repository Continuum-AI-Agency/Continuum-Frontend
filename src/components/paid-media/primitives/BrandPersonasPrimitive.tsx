"use client";

import { PersonIcon } from "@radix-ui/react-icons";

import { ComingSoonPrimitive } from "./ComingSoonPrimitive";

export function BrandPersonasPrimitive() {
  return (
    <ComingSoonPrimitive
      title="Brand Personas"
      summary="Coming soon. We’ll wire this into the same primitives surface so teams can reuse tone, visuals, and personas across channels."
      icon={<PersonIcon />}
    />
  );
}

