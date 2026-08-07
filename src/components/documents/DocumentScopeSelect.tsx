'use client';

import { DOCUMENT_SCOPE_LABELS, type DocumentScope } from '@continuum/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SCOPES: DocumentScope[] = ['active', 'temporary', 'archived'];

// Scope is a separate axis from category: category asks "what is this document FOR",
// scope asks "what stage of its life is it in". Keeping them as two pills rather than
// one merged filter means neither one hides the other's options.
export function DocumentScopeSelect({
  value,
  onChange,
}: {
  value: DocumentScope;
  onChange: (scope: DocumentScope) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as DocumentScope)}>
      <SelectTrigger
        aria-label="Filter documents by lifecycle"
        className="h-7 w-auto gap-1 rounded-full border-border/70 px-2.5 text-xs"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SCOPES.map((scope) => (
          <SelectItem key={scope} value={scope} className="text-xs">
            {DOCUMENT_SCOPE_LABELS[scope]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
