import { useState } from 'react';
import { Input } from '@/components/ui/input';

type EditableHeadingProps = {
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
};

export function EditableHeading({ value, placeholder, onCommit }: EditableHeadingProps) {
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
        className="text-left text-xl font-bold text-[#0b1220] transition-colors hover:text-[#5a39ff]"
      >
        {value || <span className="text-[#94a3b8]">{placeholder ?? 'Untitled'}</span>}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setEditing(false);
          setDraft(value);
        } else if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      className="h-9 max-w-[260px] border-[#5a39ff]/30 text-xl font-bold text-[#0b1220] focus-visible:border-[#5a39ff] focus-visible:ring-[#5a39ff]/20"
    />
  );
}
