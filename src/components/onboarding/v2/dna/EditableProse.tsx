import { useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type EditableProseProps = {
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
  className?: string;
  loading?: boolean;
};

export function EditableProse({ value, placeholder, onCommit, className, loading }: EditableProseProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    if (!value && loading) {
      return (
        <div className={`space-y-1.5 ${className ?? ""}`} aria-label="Loading">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[94%]" />
          <Skeleton className="h-3 w-[80%]" />
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`group/edit relative block w-full text-left text-[11px] leading-[1.75] text-muted-foreground hover:text-foreground ${className ?? ""}`}
      >
        <span className="pr-5">
          {value || <span className="text-muted-foreground/60">{placeholder ?? "Click to add"}</span>}
        </span>
        <PencilSimple
          aria-hidden
          className="absolute right-0 top-0 h-3 w-3 text-muted opacity-0 transition-opacity group-hover/edit:opacity-100"
        />
      </button>
    );
  }

  return (
    <Textarea
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setEditing(false);
          setDraft(value);
        }
      }}
      className="min-h-[88px] resize-none border-input bg-background text-[11px] leading-[1.75] text-foreground focus-visible:border-primary focus-visible:ring-primary/20"
    />
  );
}
