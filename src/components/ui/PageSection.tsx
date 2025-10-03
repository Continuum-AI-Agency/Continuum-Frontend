"use client";

import { PropsWithChildren } from "react";
import { cn } from "../../lib/utils";

export type PageSectionProps = PropsWithChildren<{
  className?: string;
}>;

export function PageSection({ children, className }: PageSectionProps) {
  return (
    <section className={cn("px-4 sm:px-6 md:px-8 lg:px-12 py-6 md:py-8", className)}>
      {children}
    </section>
  );
}

export default PageSection;
