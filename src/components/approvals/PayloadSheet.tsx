'use client';

import { useTranslations } from 'next-intl';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { RuleAction } from '@/lib/approvals/types';

type Props = {
  action: RuleAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PayloadSheet({ action, open, onOpenChange }: Props) {
  const uiText = useTranslations('common');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle className="text-base">{uiText('m_26a9ab994f')}</SheetTitle>
          <SheetDescription className="text-xs">{uiText('m_ffd9c800ea')}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 overflow-y-auto px-4 pb-6">
          <Section title={uiText('m_979c56a2c9')} value={action.action_payload} />
          {action.result ? <Section title={uiText('m_37a5301a88')} value={action.result} /> : null}
          {action.error ? <Section title={uiText('error_ca00fcc')} value={action.error} /> : null}
          <Section
            title={uiText('m_3adc09b3cd')}
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
      <div className="mb-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-data text-xs leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
