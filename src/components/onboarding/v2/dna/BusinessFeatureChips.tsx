import { ScrollArea } from "@/components/ui/scroll-area";
import { ChipRow } from "./listprimitives";
import type { AgentPreviewBuckets } from "../state/agentPreview";

type Props = {
  business: NonNullable<AgentPreviewBuckets["business"]>;
};

export function BusinessFeatureChips({ business }: Props) {
  const features = business.business_features ?? [];
  const benefits = business.business_benefits ?? [];
  if (features.length === 0 && benefits.length === 0) return null;
  return (
    <ScrollArea className="h-28">
      <div className="space-y-2 pr-3 pt-2">
        {features.length > 0 ? <ChipRow label="Features" values={features} variant="violet" /> : null}
        {benefits.length > 0 ? <ChipRow label="Benefits" values={benefits} variant="teal" /> : null}
      </div>
    </ScrollArea>
  );
}
