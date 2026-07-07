'use client';

import {
  CheckCircledIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  InfoCircledIcon,
} from '@radix-ui/react-icons';
import * as Toast from '@radix-ui/react-toast';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).slice(2);
    const item: ToastItem = { id, durationMs: 5000, variant: 'success', ...options };
    setToasts((prev) => {
      if (options.dedupeKey && prev.some((t) => t.dedupeKey === options.dedupeKey)) {
        return prev;
      }
      return [...prev, item];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      <Toast.Provider swipeDirection="right">
        {children}
        <Toast.Viewport className="fixed bottom-4 right-4 z-[9999] flex w-[360px] max-w-[90vw] flex-col gap-4 outline-none">
          <AnimatePresence initial={false}>
            {toasts.map((toast) => {
              const variant = toast.variant ?? 'success';
              const paletteItem = TOAST_PALETTE[variant];
              const durationSeconds = (toast.durationMs ?? 5000) / 1000;

              const isPersistent = toast.durationMs === Infinity;
              return (
                <Toast.Root
                  key={toast.id}
                  defaultOpen
                  forceMount
                  duration={isPersistent ? Number.MAX_SAFE_INTEGER : toast.durationMs}
                  onOpenChange={(open) => !open && remove(toast.id)}
                >
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
                        <Toast.Title
                          className={`text-sm font-semibold leading-5 ${paletteItem.text}`}
                        >
                          {toast.title}
                        </Toast.Title>
                        {toast.description ? (
                          <Toast.Description
                            className={`text-xs leading-relaxed ${paletteItem.subtext}`}
                          >
                            {toast.description}
                          </Toast.Description>
                        ) : null}
                        {toast.action ? (
                          <Toast.Action altText={toast.action.label} asChild>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                toast.action?.onClick();
                                remove(toast.id);
                              }}
                              className={`mt-1 inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold transition hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 ${paletteItem.ring} ${paletteItem.text}`}
                            >
                              {toast.action.label}
                            </button>
                          </Toast.Action>
                        ) : null}
                      </div>
                      <Toast.Close asChild>
                        <button
                          type="button"
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 ${paletteItem.ring}`}
                          aria-label="Dismiss toast"
                        >
                          <Cross2Icon className="h-4 w-4" />
                        </button>
                      </Toast.Close>
                    </div>

                    {isPersistent ? null : (
                      <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-muted">
                        <motion.div
                          initial={{ width: '100%' }}
                          animate={{ width: 0 }}
                          transition={{ duration: durationSeconds, ease: 'linear' }}
                          className={`${paletteItem.accent} h-full`}
                        />
                      </div>
                    )}
                  </motion.div>
                </Toast.Root>
              );
            })}
          </AnimatePresence>
        </Toast.Viewport>
      </Toast.Provider>
    </ToastContext.Provider>
  );
}
