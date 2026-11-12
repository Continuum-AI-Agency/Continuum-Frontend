'use client';

import type { DocumentScope } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SCOPES: DocumentScope[] = ['active', 'temporary', 'archived'];
const SCOPE_LABEL_KEYS = {
  active: 'active_9234069',
  temporary: 'm_33d5667cd5',
  archived: 'archived_bdb8650',
} as const satisfies Record<DocumentScope, string>;

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
  const tUi = useTranslations('common');

  return (
    <Select value={value} onValueChange={(next) => onChange(next as DocumentScope)}>
      <SelectTrigger
        aria-label={tUi('m_4c75ad58af')}
        className="h-7 w-auto gap-1 rounded-full border-border/70 px-2.5 text-xs"
      >
        <SelectValue>{tUi(SCOPE_LABEL_KEYS[value])}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SCOPES.map((scope) => (
          <SelectItem key={scope} value={scope} className="text-xs">
            {tUi(SCOPE_LABEL_KEYS[scope])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
