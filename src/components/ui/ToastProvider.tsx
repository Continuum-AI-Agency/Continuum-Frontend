"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import * as Toast from "@radix-ui/react-toast";
import { CheckCircledIcon, ExclamationTriangleIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { motion, AnimatePresence } from "framer-motion";

type ToastVariant = "success" | "error" | "info";

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastItem = ToastOptions & { id: string };

type ToastContextValue = {
  show: (options: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).slice(2);
    const item: ToastItem = { id, durationMs: 5000, variant: "info", ...options };
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
        {/* Viewport with animated items */}
        <div className="fixed z-[9999] bottom-4 right-4 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <Toast.Root open onOpenChange={(open) => !open && remove(t.id)} duration={t.durationMs} className="min-w-[280px]">
                  <div className="flex items-start gap-3 p-3 rounded-lg shadow-md bg-white/95 dark:bg-gray-900/90 border border-gray-200 dark:border-gray-700">
                    <div className="mt-0.5">
                      {t.variant === "success" && <CheckCircledIcon className="text-green-600" />}
                      {t.variant === "error" && <ExclamationTriangleIcon className="text-red-600" />}
                      {(!t.variant || t.variant === "info") && <InfoCircledIcon className="text-blue-600" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{t.title}</div>
                      {t.description && <div className="text-xs text-gray-600 dark:text-gray-300">{t.description}</div>}
                    </div>
                    <Toast.Close className="text-xs text-gray-500 hover:text-gray-700">Dismiss</Toast.Close>
                  </div>
                </Toast.Root>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Toast.Provider>
    </ToastContext.Provider>
  );
}


