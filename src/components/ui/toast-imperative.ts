// Imperative toast entry point, for callers that cannot hold a React hook.
//
// `useToast()` is a context hook, so a Zustand store or a plain module cannot reach it. That
// gap is why 22 files reached for `sonner`'s module-level `toast()` instead — and since no
// `<Toaster>` was ever mounted, all 80 of those calls pushed into a store with no renderer
// and silently rendered nothing, including both branches of the paid-media approve/reject
// flow. This routes the same call shape into the provider that IS mounted.
//
// Prefer `useToast()` inside components. Reach for this only from non-React code.

import type { ToastOptions } from './ToastProvider';

type Sink = (options: ToastOptions) => void;

let sink: Sink | null = null;
// Calls raised before the provider mounts would otherwise be dropped the same way sonner's
// were. Hold a small number and flush on registration; the cap stops a boot-time loop from
// growing without bound.
const PENDING_LIMIT = 20;
const pending: ToastOptions[] = [];

/** Called by ToastProvider once its `show` is live. */
export function registerToastSink(next: Sink): () => void {
  sink = next;
  const flush = pending.splice(0, pending.length);
  for (const options of flush) next(options);
  return () => {
    if (sink === next) sink = null;
  };
}

function emit(options: ToastOptions): void {
  if (sink) {
    sink(options);
    return;
  }
  if (pending.length < PENDING_LIMIT) pending.push(options);
}

type Extras = Omit<ToastOptions, 'title' | 'variant'>;

/** Mirrors the call shape the migrated files already used, so no call site had to change —
 *  including the bare `toast(message, { description, action })` form. */
function neutral(title: string, extras?: Extras): void {
  emit({ ...extras, title, variant: 'info' });
}

export const toast = Object.assign(neutral, {
  success: (title: string, extras?: Extras) => emit({ ...extras, title, variant: 'success' }),
  error: (title: string, extras?: Extras) => emit({ ...extras, title, variant: 'error' }),
  info: (title: string, extras?: Extras) => emit({ ...extras, title, variant: 'info' }),
  warning: (title: string, extras?: Extras) => emit({ ...extras, title, variant: 'warning' }),
});
