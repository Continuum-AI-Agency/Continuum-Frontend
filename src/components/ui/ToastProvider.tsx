'use client';

import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import {
  CheckCircledIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  InfoCircledIcon,
} from '@radix-ui/react-icons';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';

export const TOAST_VARIANTS = ['success', 'info', 'warning', 'error'] as const;

type ToastVariant = (typeof TOAST_VARIANTS)[number];

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
  action?: ToastAction;
  dedupeKey?: string;
};

type ToastItem = ToastOptions & { id: string };

type ToastVisual = {
  icon: React.ReactNode;
  accent: string;
  ring: string;
  bg: string;
  text: string;
  subtext: string;
};

const TOAST_SURFACE = 'bg-popover/95 border-border';

const TOAST_PALETTE: Record<ToastVariant, ToastVisual> = {
  success: {
    icon: <CheckCircledIcon className="h-5 w-5 text-success" />,
    accent: 'bg-success',
    ring: 'focus-visible:ring-success',
    bg: TOAST_SURFACE,
    text: 'text-foreground',
    subtext: 'text-muted-foreground',
  },
  info: {
    icon: <InfoCircledIcon className="h-5 w-5 text-primary" />,
    accent: 'bg-primary',
    ring: 'focus-visible:ring-primary',
    bg: TOAST_SURFACE,
    text: 'text-foreground',
    subtext: 'text-muted-foreground',
  },
  warning: {
    icon: <ExclamationTriangleIcon className="h-5 w-5 text-warning" />,
    accent: 'bg-warning',
    ring: 'focus-visible:ring-warning',
    bg: TOAST_SURFACE,
    text: 'text-foreground',
    subtext: 'text-muted-foreground',
  },
  error: {
    icon: <ExclamationTriangleIcon className="h-5 w-5 text-destructive" />,
    accent: 'bg-destructive',
    ring: 'focus-visible:ring-destructive',
    bg: TOAST_SURFACE,
    text: 'text-foreground',
    subtext: 'text-muted-foreground',
  },
};

export class ToastError extends Error {
  readonly options: ToastOptions;

  constructor(options: ToastOptions, cause?: unknown) {
    super(options.description ?? options.title);
    this.name = 'ToastError';
    this.options = options;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export function throwToastError(options: ToastOptions, cause?: unknown): never {
  throw new ToastError(options, cause);
}

export function coerceToastOptions(error: unknown, fallback: ToastOptions): ToastOptions {
  if (error instanceof ToastError) return error.options;
  return fallback;
}

type ToastContextValue = {
  show: (options: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToastContext(): ToastContextValue | null {
  return useContext(ToastContext);
}

export function useToast(): ToastContextValue {
  const ctx = useToastContext();
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

type ToastData = {
  variant: ToastVariant;
  action?: ToastAction;
  durationMs?: number;
};

// Bridges our `show()` API onto Base UI's toast manager. Base UI is manager-driven (Toast.Root
// takes a toast object) where Radix let you render Roots yourself, so the list lives in the
// manager now instead of local state.
function ToastBridge({ children }: { children: React.ReactNode }) {
  const manager = ToastPrimitive.useToastManager();

  const show = useCallback(
    (options: ToastOptions) => {
      const durationMs = options.durationMs ?? 5000;
      manager.add<ToastData>({
        // Adding with an existing id updates that toast in place, which is what dedupeKey asked
        // for. NOTE: Radix's version dropped the duplicate outright; this one also refreshes the
        // dismiss timer.
        id: options.dedupeKey,
        title: options.title,
        description: options.description,
        timeout: durationMs === Number.POSITIVE_INFINITY ? 0 : durationMs,
        data: { variant: options.variant ?? 'success', action: options.action, durationMs },
      });
    },
    [manager],
  );

  const value = useMemo<ToastContextValue>(() => ({ show }), [show]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

function ToastList() {
  const { toasts, close } = ToastPrimitive.useToastManager<ToastData>();

  return (
    <AnimatePresence initial={false}>
      {toasts.map((toast) => {
        const variant = toast.data?.variant ?? 'success';
        const paletteItem = TOAST_PALETTE[variant];
        const durationMs = toast.data?.durationMs ?? 5000;
        const isPersistent = durationMs === Number.POSITIVE_INFINITY;
        const action = toast.data?.action;

        return (
          <ToastPrimitive.Root key={toast.id} toast={toast} swipeDirection="right">
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`relative overflow-hidden rounded-xl border px-4 py-4 shadow-lg backdrop-blur ${paletteItem.bg}`}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  {paletteItem.icon}
                </div>
                <div className="flex-1 space-y-2">
                  <ToastPrimitive.Title
                    className={`text-sm font-semibold leading-5 ${paletteItem.text}`}
                  />
                  {toast.description ? (
                    <ToastPrimitive.Description
                      className={`text-xs leading-relaxed ${paletteItem.subtext}`}
                    />
                  ) : null}
                  {action ? (
                    <ToastPrimitive.Close
                      render={
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            action.onClick();
                            close(toast.id);
                          }}
                          className={`mt-1 inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold transition hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 ${paletteItem.ring} ${paletteItem.text}`}
                        >
                          {action.label}
                        </button>
                      }
                    />
                  ) : null}
                </div>
                <ToastPrimitive.Close
                  aria-label="Dismiss toast"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 ${paletteItem.ring}`}
                >
                  <Cross2Icon className="h-4 w-4" />
                </ToastPrimitive.Close>
              </div>

              {isPersistent ? null : (
                <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-muted">
                  <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: 0 }}
                    transition={{ duration: durationMs / 1000, ease: 'linear' }}
                    className={`${paletteItem.accent} h-full`}
                  />
                </div>
              )}
            </motion.div>
          </ToastPrimitive.Root>
        );
      })}
    </AnimatePresence>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider>
      <ToastBridge>{children}</ToastBridge>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[9999] flex w-[360px] max-w-[90vw] flex-col gap-4 outline-none">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
