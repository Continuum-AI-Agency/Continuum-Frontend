import { useState } from "react";
import { Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

type EditableProseProps = {
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
  className?: string;
};

export function EditableProse({ value, placeholder, onCommit, className }: EditableProseProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`group/edit relative block w-full text-left text-[11px] leading-[1.75] text-[#374151] transition-colors hover:text-[#0b1220] ${className ?? ""}`}
      >
        <span className="pr-5">
          {value || <span className="text-[#94a3b8]">{placeholder ?? "Click to add"}</span>}
        </span>
        <Pencil
          aria-hidden
          className="absolute right-0 top-0 h-3 w-3 text-[#cbd5e1] opacity-0 transition-opacity group-hover/edit:opacity-100"
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
      className="min-h-[88px] resize-none border-[#5a39ff]/30 text-[11px] leading-[1.75] text-[#374151] focus-visible:border-[#5a39ff] focus-visible:ring-[#5a39ff]/20"
    />
  );
}
