import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TonePicker } from "./TonePicker";
import { FindingCallout } from "../readiness/FindingCallout";
import type { ReadinessFinding } from "@/lib/onboarding/agentClient";

type Props = {
  chip?: React.ReactNode;
  finding?: ReadinessFinding | null;
};

export function ToneCard({ chip, finding }: Props) {
  return (
    <Card className="border-[#e5e7eb] shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-[#64748b]">
          Tone of voice
        </CardTitle>
        {chip}
      </CardHeader>
      <CardContent className="space-y-3">
        <TonePicker />
        {finding ? <FindingCallout finding={finding} /> : null}
      </CardContent>
    </Card>
  );
}
