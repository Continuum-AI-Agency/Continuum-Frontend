'use client';

import { Copy, ShieldCheck } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast-imperative';

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Could not copy the ${label.toLowerCase()}`);
  }
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button size="sm" variant="outline" type="button" onClick={() => void copy(value, label)}>
      <Copy data-icon="inline-start" />
      Copy {label.toLowerCase()}
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
  const acknowledgeId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <Alert>
      <ShieldCheck aria-hidden="true" />
      <AlertTitle>Copy this signing secret now</AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-xs">Shown once for {subject}. Continuum cannot show it again.</p>
        <CopyBlock value={secret} label="Signing secret" />
        {children}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs" htmlFor={acknowledgeId}>
            <Checkbox
              id={acknowledgeId}
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
            />
            I&rsquo;ve copied it
          </label>
          <Button size="sm" disabled={!acknowledged} onClick={onDismiss}>
            Done
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
