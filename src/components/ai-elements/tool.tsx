"use client";

import { ChevronDown, Code2, Loader2 } from "lucide-react";
import { createContext, Fragment, useContext, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type ToolState = "input-available" | "output-available" | "error" | "running";

export function getStatusBadge(state: string) {
  switch (state) {
    case "call":
    case "running":
    case "input-streaming":
    case "input-available":
      return (
        <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">
          Running
        </Badge>
      );
    case "result":
    case "output-available":
      return (
        <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
          Success
        </Badge>
      );
    case "error":
    case "output-error":
      return (
        <Badge variant="outline" className="border-transparent bg-destructive/15 text-destructive">
          Error
        </Badge>
      );
    default:
      return null;
  }
}

type ToolContextType = {
  type: string;
  state: ToolState;
  open: boolean;
};

const ToolContext = createContext<ToolContextType | null>(null);

function useTool() {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error("Tool components must be used within a Tool provider");
  }
  return context;
}

type ToolProps = {
  children: ReactNode;
  type: string;
  state: ToolState;
  defaultOpen?: boolean;
};

export function Tool({ children, type, state, defaultOpen = false }: ToolProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <ToolContext.Provider value={{ type, state, open }}>
      <Collapsible open={open} onOpenChange={setOpen} className="w-full">
        <div className="overflow-hidden rounded-lg border border-border bg-muted/40">{children}</div>
      </Collapsible>
    </ToolContext.Provider>
  );
}

export function ToolHeader({
  title,
  showDisclosure = true,
}: {
  title?: string;
  showDisclosure?: boolean;
}) {
  const { type, state, open } = useTool();
  const safeType = typeof type === "string" && type.trim().length > 0 ? type : "unknown_tool";
  const displayTitle = title || safeType.replace("tool-", "").replace(/_/g, " ");

  return (
    <CollapsibleTrigger asChild>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-sm p-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Code2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground">{displayTitle}</span>
          {state === "running" && (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          )}
        </span>
        {showDisclosure ? (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open ? "rotate-180" : "rotate-0"
            )}
          />
        ) : null}
      </button>
    </CollapsibleTrigger>
  );
}

export function ToolContent({ children }: { children: ReactNode }) {
  return (
    <CollapsibleContent>
      <div className="space-y-3 border-t border-border p-3">{children}</div>
    </CollapsibleContent>
  );
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function scalarText(value: string | number | boolean | null): string {
  return value === null ? "null" : String(value);
}

// Humanized payload renderer: a flat object of scalars reads as label/value
// rows; a lone scalar reads as plain text; anything nested (objects, arrays)
// falls back to indented JSON so structure is never lost.
function ToolPayload({ label, value }: { label: string; value: unknown }) {
  const isPlainObject = value !== null && typeof value === "object" && !Array.isArray(value);
  const entries = isPlainObject ? Object.entries(value as Record<string, unknown>) : [];
  const allScalar = isPlainObject && entries.length > 0 && entries.every(([, v]) => isScalar(v));

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {allScalar ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          {entries.map(([key, val]) => (
            <Fragment key={key}>
              <dt className="font-medium text-muted-foreground">{key}</dt>
              <dd className="min-w-0 break-words text-foreground">{scalarText(val as string | number | boolean | null)}</dd>
            </Fragment>
          ))}
        </dl>
      ) : isScalar(value) ? (
        <p className="break-words text-xs text-foreground">{scalarText(value)}</p>
      ) : (
        <pre className="max-h-56 overflow-auto rounded-md border border-border bg-background/60 p-2 text-[11px] leading-relaxed text-foreground">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ToolInput({ value }: { value: unknown }) {
  return <ToolPayload label="Input" value={value} />;
}

export function ToolOutput({ value }: { value: unknown }) {
  return <ToolPayload label="Output" value={value} />;
}
