'use client';

import { useLocale, useTranslations } from 'next-intl';

// The moment after a Stripe Checkout return: a receipt printer whose status pill follows the
// real purchase (Stripe paid, our webhook granted it, Stripe's invoice exists), then feeds the
// receipt out in short thermal-printer pulls. The receipt offers Stripe's own invoice PDF.

import type { BillingCheckoutReceipt } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Download, Loader2, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ContinuumWordmark } from '@/components/shared/ContinuumWordmark';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useRouter } from '@/i18n/navigation';
import { fetchCheckoutReceipt } from '@/lib/billing/billingApi';
import {
  CHANGE_POLL_INTERVAL_MS,
  CHANGE_POLL_WINDOW_MS,
  type ReceiptPhase,
  receiptPhase,
} from '@/lib/billing/billingViewModel';
import type { CheckoutReceiptState } from '@/lib/billing/useBilling';
import { cn } from '@/lib/utils';

const getSTATUS = (
  tUi: ReturnType<typeof useTranslations<'common'>>,
): Record<ReceiptPhase, { label: string; icon: ReactNode }> => ({
  processing: {
    label: tUi('m_e2ada0127b'),
    icon: <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />,
  },
  printing: {
    label: tUi('m_fe8fd87bd2'),
    icon: <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />,
  },
  complete: { label: tUi('m_cd00866a63'), icon: <CircleCheck className="size-4 text-success" /> },
  delayed: {
    label: tUi('m_e2429dc53e'),
    icon: <TriangleAlert className="size-4 text-warning" />,
  },
  unavailable: {
    label: tUi('m_daa315a645'),
    icon: <TriangleAlert className="size-4 text-warning" />,
  },
});

// Four pulls with a beat between each, the way a thermal printer advances paper.
const FEED = {
  y: ['-100%', '-74%', '-74%', '-48%', '-48%', '-22%', '-22%', '0%'],
  times: [0, 0.18, 0.26, 0.44, 0.52, 0.7, 0.78, 1],
};

const makeDateFormat = (locale: string) =>
  new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

function money(minor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(minor / 100);
}

export function CheckoutReceiptDialog({
  brandId,
  receipt: state,
  onClose,
}: {
  brandId: string;
  receipt: CheckoutReceiptState;
  onClose: () => void;
}) {
  const uiLocale = useLocale();

  const uiText = useTranslations('common');
  const STATUS = getSTATUS(uiText);
  const router = useRouter();
  const dateFormat = makeDateFormat(uiLocale);
  const reduceMotion = useReducedMotion();
  const [windowElapsed, setWindowElapsed] = useState(false);
  const [fed, setFed] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);
  const expired = windowElapsed || state.status === 'timed_out';

  useEffect(() => {
    const timer = setTimeout(() => setWindowElapsed(true), CHANGE_POLL_WINDOW_MS);
    return () => clearTimeout(timer);
  }, []);

  const query = useQuery({
    queryKey: ['billing', 'checkout-receipt', brandId, state.sessionId],
    queryFn: () => fetchCheckoutReceipt(brandId, state.sessionId),
    retry: 1,
    // Stripe attaches a pack's invoice a moment after payment: poll until it is there.
    refetchInterval: (current) => {
      const data = current.state.data;
      return expired || (data?.paid && data.invoicePdf) ? false : CHANGE_POLL_INTERVAL_MS;
    },
  });
  const receipt = query.data;

  const phase = receiptPhase({
    receipt,
    failed: query.isError && !receipt,
    settled: state.status === 'settled',
    expired,
    printed: fed || Boolean(reduceMotion),
  });
  const settledPhase = phase === 'complete' || phase === 'delayed' || phase === 'unavailable';
  const showPaper = receipt && phase !== 'processing' && phase !== 'unavailable';

  useEffect(() => {
    if (settledPhase) doneRef.current?.focus();
  }, [settledPhase]);

  const close = () => {
    onClose();
    if (state.from) router.push(state.from);
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-zinc-950/40"
        className="top-[max(1rem,8dvh)] w-[min(22.5rem,calc(100%-2rem))] translate-y-0 gap-0 overflow-y-auto bg-transparent p-2 ring-0 sm:max-w-none"
        data-testid="checkout-receipt"
        data-phase={phase}
      >
        <div className="relative z-10 rounded-[1.75rem] bg-muted p-3 pb-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_20px_40px_-16px_rgb(15_23_42/0.45)] ring-1 ring-foreground/10 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_20px_40px_-16px_rgb(0_0_0/0.7)]">
          <div className="flex items-center justify-between px-1.5 pb-2.5">
            <DialogTitle className="text-xs font-medium text-muted-foreground">
              {uiText('m_f6ce3b6fcf')}
            </DialogTitle>
            <DialogClose
              render={<Button variant="ghost" size="icon-sm" className="rounded-full" />}
              aria-label={uiText('close_7d9eb7a')}
            >
              <X />
            </DialogClose>
          </div>
          <div
            role="status"
            className="flex h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-background/85 text-sm font-medium text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] ring-1 ring-foreground/5 dark:shadow-none"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={phase}
                className="flex items-center gap-2"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              >
                {STATUS[phase].icon}
                {STATUS[phase].label}
              </motion.span>
            </AnimatePresence>
          </div>
          <div
            aria-hidden
            className="absolute inset-x-5 bottom-2 h-1.5 rounded-full bg-foreground/15"
          />
        </div>

        {showPaper ? (
          <div className="relative mx-5 -mt-3.5 overflow-hidden pt-1.5 drop-shadow-[0_10px_14px_rgb(15_23_42/0.18)]">
            <motion.div
              initial={reduceMotion ? false : { y: '-100%' }}
              animate={reduceMotion ? undefined : { y: FEED.y }}
              transition={{ duration: 1.7, times: FEED.times, ease: 'easeOut' }}
              onAnimationComplete={() => setFed(true)}
            >
              <ReceiptPaper receipt={receipt} />
            </motion.div>
          </div>
        ) : null}

        {phase === 'unavailable' ? (
          <p className="px-3 pt-4 text-center text-sm text-muted-foreground">
            {uiText('m_a8b784236e')}
          </p>
        ) : null}

        <motion.div
          className="flex gap-2 px-5 pt-5"
          initial={false}
          animate={settledPhase ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          transition={{ duration: reduceMotion ? 0 : 0.3 }}
          hidden={!settledPhase}
        >
          {receipt?.invoicePdf ? (
            <a
              href={receipt.invoicePdf}
              target="_blank"
              rel="noopener"
              className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}
            >
              <Download />
              {uiText('m_992261388e')}
            </a>
          ) : null}
          <Button ref={doneRef} className="flex-1" onClick={close}>
            {state.from ? uiText('m_d68f0b00e5') : uiText('done_11a6767')}
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptPaper({ receipt }: { receipt: BillingCheckoutReceipt }) {
  const uiLocale = useLocale();

  const uiText = useTranslations('common');
  const { currency } = receipt;
  const date = makeDateFormat(uiLocale).format(new Date(receipt.createdAt));
  return (
    <div className="receipt-edge bg-[#fafafa] px-6 pt-6 pb-10 font-mono text-[13px] leading-relaxed text-[#18181b]">
      <ContinuumWordmark height={20} />
      <p className="mt-3 text-[#52525b]">
        {receipt.invoiceNumber ? (
          <>
            {uiText('m_b3aca2ab28')}
            {receipt.invoiceNumber}
            <br />
          </>
        ) : null}
        {date}
      </p>
      <dl className="mt-5 space-y-1.5">
        {receipt.lines.map((line, index) => (
          <ReceiptRow
            key={`${index}:${line.description}`}
            label={line.quantity > 1 ? `${line.description} × ${line.quantity}` : line.description}
            value={money(line.amount, currency, uiLocale)}
          />
        ))}
        {receipt.discount > 0 ? (
          <ReceiptRow
            label={uiText('m_b524936d7a')}
            value={`-${money(receipt.discount, currency, uiLocale)}`}
          />
        ) : null}
        {receipt.tax > 0 ? (
          <ReceiptRow
            label={uiText('m_9be70f66f8')}
            value={money(receipt.tax, currency, uiLocale)}
          />
        ) : null}
      </dl>
      <div className="my-4 border-t border-dashed border-[#d4d4d8]" />
      <dl>
        <ReceiptRow
          label={uiText('total_c9b3c38')}
          value={money(receipt.total, currency, uiLocale)}
          strong
        />
      </dl>
      <p className="mt-6 text-center text-[#52525b]">{uiText('m_562004c6b7')}</p>
    </div>
  );
}

function ReceiptRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'font-bold')}>
      <dt className="min-w-0">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
