"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import * as Toast from "@radix-ui/react-toast";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircledIcon, Cross2Icon, ExclamationTriangleIcon, InfoCircledIcon } from "@radix-ui/react-icons";

export const TOAST_VARIANTS = ["success", "info", "warning", "error"] as const;

type ToastVariant = (typeof TOAST_VARIANTS)[number];

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
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

const TOAST_PALETTE: Record<ToastVariant, ToastVisual> = {
  success: {
    icon: <CheckCircledIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
    accent: "bg-emerald-500",
    ring: "focus-visible:ring-emerald-500",
    bg: "bg-white/95 dark:bg-slate-900/90 border-emerald-100 dark:border-emerald-900/60",
    text: "text-emerald-900 dark:text-emerald-50",
    subtext: "text-emerald-700 dark:text-emerald-200",
  },
  info: {
    icon: <InfoCircledIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />,
    accent: "bg-indigo-500",
    ring: "focus-visible:ring-indigo-500",
    bg: "bg-white/95 dark:bg-slate-900/90 border-indigo-100 dark:border-indigo-900/60",
    text: "text-indigo-900 dark:text-indigo-50",
    subtext: "text-indigo-700 dark:text-indigo-200",
  },
  warning: {
    icon: <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
    accent: "bg-amber-500",
    ring: "focus-visible:ring-amber-500",
    bg: "bg-white/95 dark:bg-slate-900/90 border-amber-100 dark:border-amber-900/60",
    text: "text-amber-900 dark:text-amber-50",
    subtext: "text-amber-700 dark:text-amber-200",
  },
  error: {
    icon: <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />,
    accent: "bg-red-500",
    ring: "focus-visible:ring-red-500",
    bg: "bg-white/95 dark:bg-slate-900/90 border-red-100 dark:border-red-900/60",
    text: "text-red-900 dark:text-red-50",
    subtext: "text-red-700 dark:text-red-200",
  },
};

export class ToastError extends Error {
  readonly options: ToastOptions;

  constructor(options: ToastOptions, cause?: unknown) {
    super(options.description ?? options.title);
    this.name = "ToastError";
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
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).slice(2);
    const item: ToastItem = { id, durationMs: 5000, variant: "success", ...options };
    setToasts((prev) => [...prev, item]);
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
              const variant = toast.variant ?? "success";
              const paletteItem = TOAST_PALETTE[variant];
              const durationSeconds = (toast.durationMs ?? 5000) / 1000;

              return (
                <Toast.Root
                  key={toast.id}
                  defaultOpen
                  forceMount
                  duration={toast.durationMs}
                  onOpenChange={(open) => !open && remove(toast.id)}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className={`relative overflow-hidden rounded-xl border px-4 py-4 shadow-xl backdrop-blur ${paletteItem.bg}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5 dark:bg-white/5">
                        {paletteItem.icon}
                      </div>
                      <div className="flex-1 space-y-2">
                        <Toast.Title className={`text-sm font-semibold leading-5 ${paletteItem.text}`}>{toast.title}</Toast.Title>
                        {toast.description ? (
                          <Toast.Description className={`text-xs leading-relaxed ${paletteItem.subtext}`}>{toast.description}</Toast.Description>
                        ) : null}
                      </div>
                      <Toast.Close asChild>
                        <button
                          type="button"
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs text-gray-500 transition hover:bg-black/5 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 ${paletteItem.ring}`}
                          aria-label="Dismiss toast"
                        >
                          <Cross2Icon className="h-4 w-4" />
                        </button>
                      </Toast.Close>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-black/5 dark:bg-white/5">
                      <motion.div
                        initial={{ width: "100%" }}
                        animate={{ width: 0 }}
                        transition={{ duration: durationSeconds, ease: "linear" }}
                        className={`${paletteItem.accent} h-full`}
                      />
                    </div>
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
