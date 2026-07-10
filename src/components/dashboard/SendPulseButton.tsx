'use client';

// Opens the Continuum Report recipient picker. On-demand emails are "Continuum
// Report" (not the scheduled Continuum Pulse digest). Same edge builder, product
// presentation name differs.

import { PaperPlaneIcon } from '@radix-ui/react-icons';
import { useState } from 'react';
import { SendContinuumReportDialog } from '@/components/dashboard/SendContinuumReportDialog';
import { Button } from '@/components/ui/button';

type SendPulseButtonProps = {
  brandId: string;
};

export function SendPulseButton({ brandId }: SendPulseButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PaperPlaneIcon aria-hidden />
        Email Continuum Report
      </Button>
      <SendContinuumReportDialog brandId={brandId} open={open} onOpenChange={setOpen} />
    </>
  );
}
