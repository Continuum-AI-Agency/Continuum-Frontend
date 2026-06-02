"use client";

import { ShieldQuestion } from "lucide-react";
import { Badge } from "@radix-ui/themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ToolApproval } from "./types";

function summarizeInput(input: unknown): string | null {
  if (input == null) return null;
  try {
    const text = typeof input === "string" ? input : JSON.stringify(input);
    return text.length > 240 ? `${text.slice(0, 240)}…` : text;
  } catch {
    return null;
  }
}

export function ToolApprovalCard({
  approval,
  onApproveAction,
  onDenyAction,
  disabled,
}: {
  approval: ToolApproval;
  onApproveAction: () => void;
  onDenyAction: () => void;
  disabled?: boolean;
}) {
  const summary = summarizeInput(approval.input);
  return (
    <Card className="overflow-hidden border-amber-400/40">
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-1.5">
          <ShieldQuestion className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-sm font-medium text-foreground">Approval required</span>
          <Badge variant="soft" color="amber" size="1">
            {approval.toolName}
          </Badge>
        </div>
        {summary && (
          <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
            {summary}
          </pre>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={disabled} onClick={onDenyAction}>
            Deny
          </Button>
          <Button size="sm" className="h-7 text-xs" disabled={disabled} onClick={onApproveAction}>
            Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
