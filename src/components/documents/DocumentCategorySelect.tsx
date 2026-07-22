'use client';

import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_CATEGORY_VALUES,
  type DocumentCategory,
} from '@continuum/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// Compact 5-option category picker, reused by the document row (re-tag) and the
// upload bar (default for new uploads). For the list-level filter (which adds an
// "All" option) see CategoryFilterSelect in DocumentList.
export function DocumentCategorySelect({
  value,
  onChange,
  disabled,
  ariaLabel = 'Document category',
  className,
}: {
  value: DocumentCategory;
  onChange: (category: DocumentCategory) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as DocumentCategory)}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className={cn('h-7 gap-1 rounded-full px-2.5 text-xs font-medium', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DOCUMENT_CATEGORY_VALUES.map((category) => (
          <SelectItem key={category} value={category} className="text-xs">
            {DOCUMENT_CATEGORY_LABELS[category]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
