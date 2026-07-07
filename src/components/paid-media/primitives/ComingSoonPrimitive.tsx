'use client';

import type { ReactElement } from 'react';
import { Separator } from '@/components/ui/separator';

type ComingSoonPrimitiveProps = {
  title: string;
  summary: string;
  icon: ReactElement;
};

export function ComingSoonPrimitive({ title, summary, icon }: ComingSoonPrimitiveProps) {
  return (
    <div className="glass-panel rounded-lg p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <h4 className="text-lg font-semibold text-white">{title}</h4>
        </div>
        <span className="text-muted-foreground">{summary}</span>
        <Separator />
        <span className="text-muted-foreground">
          Add requirements and sample assets here to keep the build aligned.
        </span>
      </div>
    </div>
  );
}
