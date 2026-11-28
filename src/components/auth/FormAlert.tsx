'use client';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react';

type FormAlertVariant = 'error' | 'success' | 'warning' | 'info';

interface FormAlertProps {
  message: string;
  variant?: FormAlertVariant;
}

const VARIANT_STYLES: Record<
  FormAlertVariant,
  { bg: string; border: string; icon: string; text: string }
> = {
  error: {
    bg: 'bg-red-50 dark:bg-red-950/20',
    border: 'border-red-200 dark:border-red-800',
    icon: 'text-red-600 dark:text-red-400',
    text: 'text-red-800 dark:text-red-200',
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-950/20',
    border: 'border-green-200 dark:border-green-800',
    icon: 'text-green-600 dark:text-green-400',
    text: 'text-green-800 dark:text-green-200',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800',
    icon: 'text-amber-600 dark:text-amber-400',
    text: 'text-amber-800 dark:text-amber-200',
  },
  info: {
    bg: 'bg-sky-50 dark:bg-sky-950/20',
    border: 'border-sky-200 dark:border-sky-800',
    icon: 'text-sky-600 dark:text-sky-400',
    text: 'text-sky-800 dark:text-sky-200',
  },
};

const VARIANT_ICONS: Record<FormAlertVariant, React.ReactNode> = {
  error: <TriangleAlert className="w-5 h-5" />,
  success: <CircleCheck className="w-5 h-5" />,
  warning: <TriangleAlert className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
};

export function FormAlert({ message, variant = 'error' }: FormAlertProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      className={`mb-6 p-4 rounded-xl border-2 flex items-start gap-3 ${styles.bg} ${styles.border}`}
      role="alert"
    >
      <div className={`flex-shrink-0 mt-0.5 ${styles.icon}`}>{VARIANT_ICONS[variant]}</div>
      <p className={`text-sm font-medium leading-relaxed ${styles.text}`}>{message}</p>
    </div>
  );
}
