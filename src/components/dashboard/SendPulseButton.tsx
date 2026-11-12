'use client';

import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';

// Opens the Continuum Report recipient picker. On-demand emails are "Continuum
// Report" (not the scheduled Continuum Pulse digest). Same edge builder, product
// presentation name differs.

import { useState } from 'react';
import { SendContinuumReportDialog } from '@/components/dashboard/SendContinuumReportDialog';
import { Button } from '@/components/ui/button';

type SendPulseButtonProps = {
  brandId: string;
};

export function SendPulseButton({ brandId }: SendPulseButtonProps) {
  const tUi = useTranslations('dashboard');

  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send aria-hidden />
        {tUi('email_continuum_report_fed107b')}
      </Button>
      <SendContinuumReportDialog brandId={brandId} open={open} onOpenChange={setOpen} />
    </>
  );
}
