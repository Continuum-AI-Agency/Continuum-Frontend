'use client';

import { Copy, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast-imperative';

async function copy(
  value: string,
  label: string,
  translate: ReturnType<typeof useTranslations<'scale'>>,
) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(translate('copied_label', { label }));
  } catch {
    toast.error(translate('copy_failed_label', { label }));
  }
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const uiText = useTranslations('scale');
  return (
    <Button
      size="sm"
      variant="outline"
      type="button"
      onClick={() => void copy(value, label, uiText)}
    >
      {uiText.rich('sentence_3b090963837f', {
        v0: () => <Copy data-icon="inline-start" />,
        v1: label.toLowerCase(),
      })}
    </Button>
  );
}

export function CopyBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <pre className="overflow-x-auto whitespace-pre rounded bg-muted p-2 text-xs">{value}</pre>
      <CopyButton value={value} label={label} />
    </div>
  );
}

/**
 * A signing secret exists exactly once: it stays on screen until the user says they copied it,
 * and is gone for good after that.
 */
export function RevealOnceSecret({
  secret,
  subject,
  onDismiss,
  children,
}: {
  secret: string;
  subject: string;
  onDismiss: () => void;
  children?: ReactNode;
}) {
  const uiText = useTranslations('scale');
  const acknowledgeId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <Alert>
      <ShieldCheck aria-hidden="true" />
      <AlertTitle>{uiText('copy_this_signing_secret_now_62dfe07')}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-xs">{uiText.rich('sentence_2d2e8c304d64', { v0: subject })}</p>
        <CopyBlock value={secret} label={uiText('signing_secret_e7ee22e')} />
        {children}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs" htmlFor={acknowledgeId}>
            {uiText.rich('sentence_82256ab81eb9', {
              v0: () => (
                <Checkbox
                  id={acknowledgeId}
                  checked={acknowledged}
                  onCheckedChange={(checked) => setAcknowledged(checked === true)}
                />
              ),
            })}
          </label>
          <Button size="sm" disabled={!acknowledged} onClick={onDismiss}>
            {uiText('done_11a6767')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function PanelError({ message }: { message: string | null }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function SwitchField({
  checked,
  onCheckedChange,
  disabled,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex h-8 items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      <Label htmlFor={id} className="font-normal">
        {children}
      </Label>
    </div>
  );
}
