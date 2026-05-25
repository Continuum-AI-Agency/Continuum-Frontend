"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { RuleAction } from "@/lib/approvals/types";

type Props = {
  action: RuleAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PayloadSheet({ action, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle className="text-base">Raw action payload</SheetTitle>
          <SheetDescription className="text-xs">
            The action_payload and any upstream result returned by the executor.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 overflow-y-auto px-4 pb-6">
          <Section title="action_payload" value={action.action_payload} />
          {action.result ? <Section title="result" value={action.result} /> : null}
          {action.error ? <Section title="error" value={action.error} /> : null}
          <Section
            title="ids"
            value={{
              id: action.id,
              rule_id: action.rule_id ?? null,
              evaluation_id: action.evaluation_id ?? null,
              flow_run_id: action.flow_run_id ?? null,
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-data text-xs leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
