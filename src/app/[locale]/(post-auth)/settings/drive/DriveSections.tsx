'use client';
import { useLocale, useTranslations } from 'next-intl';

// The client islands of Settings → Drive. App tokens are read and changed through server
// actions (./actions); the plaintext exists only in the create response and is shown once.

import { type CreateAppTokenResponse, createAppTokenRequestSchema } from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Download } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiBaseUrl } from '@/lib/api/config';
import { createAppTokenAction, listAppTokensAction, revokeAppTokenAction } from './actions';

const APP_TOKENS_KEY = ['drive', 'app-tokens'] as const;

function formatTimestamp(value: string | null, locale: string): string {
  if (!value) return 'never';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(locale);
}

export function CopyButton({
  value,
  label,
  iconOnly = false,
}: {
  value: string;
  label: string;
  iconOnly?: boolean;
}) {
  const tUi = useTranslations('settings');

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? 'icon-sm' : 'sm'}
      className="shrink-0 gap-1.5 text-muted-foreground"
      onClick={() => void copy()}
      aria-label={
        copied
          ? tUi('m_bf0c2d91fb', { v0: String(label) })
          : tUi('m_fa1b57908c', { v0: String(label) })
      }
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite" className={iconOnly ? 'sr-only' : undefined}>
        {copied ? tUi('m_8e3df45a49') : tUi('m_af74f7c536')}
      </span>
    </Button>
  );
}

export function CodeLine({ children }: { children: string }) {
  return (
    <code className="block overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
      {children}
    </code>
  );
}

export function DriveAppTokens() {
  const uiLocale = useLocale();

  const tUi = useTranslations('settings');

  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<CreateAppTokenResponse | null>(null);

  const tokens = useQuery({
    queryKey: APP_TOKENS_KEY,
    queryFn: () => listAppTokensAction(),
    retry: false,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: APP_TOKENS_KEY });

  const create = useMutation({
    mutationFn: (name: string) => createAppTokenAction({ name }),
    onSuccess: (created) => {
      setRevealed(created);
      setName('');
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeAppTokenAction(id),
    onSuccess: refresh,
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = createAppTokenRequestSchema.safeParse({ name });
    if (!parsed.success) {
      setNameError(tUi('m_56daea80c7'));
      return;
    }
    setNameError(null);
    create.mutate(parsed.data.name);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-1">
          <Input
            data-testid="drive-token-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={tUi('m_5380a86f73')}
            aria-label={tUi('m_b031b8163a')}
            maxLength={80}
          />
          {nameError ? <p className="text-xs text-destructive">{nameError}</p> : null}
        </div>
        <Button data-testid="drive-token-create" type="submit" disabled={create.isPending}>
          {create.isPending ? tUi('m_94d7d8ee47') : tUi('m_4b3c8e356a')}
        </Button>
      </form>
      {create.isError ? <p className="text-sm text-destructive">{tUi('m_dcb6e1b480')}</p> : null}

      {revealed ? (
        <div
          data-testid="drive-token-reveal"
          className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3"
        >
          <p className="text-sm font-medium">
            {tUi('m_400e621b14')}
            {revealed.name}
            {tUi('m_c9bfa40b6d')}
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-background/60 px-2 py-1.5 font-mono text-xs">
              {revealed.token}
            </code>
            <CopyButton value={revealed.token} label={tUi('m_ee977806d7')} />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed(null)}>
            {tUi('m_e1ab429a6c')}
          </Button>
        </div>
      ) : null}

      {tokens.isPending ? (
        <p className="text-sm text-muted-foreground">{tUi('m_7f632a139e')}</p>
      ) : tokens.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">{tUi('m_3782b9ab06')}</p>
          <Button variant="secondary" onClick={() => void tokens.refetch()}>
            {tUi('m_9f5cd8a2e8')}
          </Button>
        </div>
      ) : tokens.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tUi('m_9896533313')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tokens.data.map((token) => (
            <li
              key={token.id}
              data-testid="drive-token-row"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{token.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">····{token.last4}</span>
                  {token.revokedAt ? <Pill variant="muted">{tUi('m_85f17ac049')}</Pill> : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {tUi('m_05e8fd6944')}
                  {formatTimestamp(token.createdAt, uiLocale)}
                  {tUi('m_627a3dba8d')} {formatTimestamp(token.lastUsedAt, uiLocale)}
                </span>
              </div>
              {token.revokedAt ? null : (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={revoke.isPending && revoke.variables === token.id}
                      >
                        {tUi('m_0be720759f')}
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {tUi('m_0991de93d3')}
                        {token.name}”?
                      </AlertDialogTitle>
                      <AlertDialogDescription>{tUi('m_bca270994b')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tUi('m_d9f3692497')}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => revoke.mutate(token.id)}
                      >
                        {tUi('m_9b8466169c')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </li>
          ))}
        </ul>
      )}
      {revoke.isError ? <p className="text-sm text-destructive">{tUi('m_e0ea4f3a00')}</p> : null}
    </div>
  );
}

/** How to mount a brand drive on each OS — shown from the Brand drives "How to connect" hint. */
export function DriveConnectSteps({ email }: { email: string }) {
  const tUi = useTranslations('settings');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">{tUi('m_cd6fdcbf5a')}</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{tUi('m_cdb08cb10c')}</li>
            <li>{tUi('m_a0a6cd08a9')}</li>
            <li>
              {tUi('m_b3f69f1983')}
              <span className="text-foreground">{email}</span>
              {tUi('m_c59298da58')}
            </li>
          </ol>
          <p data-testid="drive-mac-free-space" className="text-xs text-muted-foreground">
            {tUi('m_5ca36aec81')}
            <code>{tUi('m_42d5069865')}</code>
            {tUi('m_0ee4474088')}
          </p>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">{tUi('m_26d9c28d78')}</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{tUi('m_8b49677ebf')}</li>
            <li>{tUi('m_2953cb445f')}</li>
            <li>{tUi('m_9e53ace00c')}</li>
            <li>
              {tUi('m_ba92735f4a')}
              <span className="text-foreground">{email}</span>
              {tUi('m_c59298da58')}
            </li>
          </ol>
          <p data-testid="drive-windows-size-limit" className="text-xs text-muted-foreground">
            {tUi('m_8adfa698b6')}
          </p>
          <CodeLine>{tUi('m_e301ee1c06')}</CodeLine>
          <p className="text-xs text-muted-foreground">{tUi('m_7a67569b30')}</p>
        </div>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>{tUi('m_90572ab855')}</li>
        <li>{tUi('m_21f0fd8002')}</li>
        <li>{tUi('m_6a0884b76c')}</li>
      </ul>
    </div>
  );
}

const CLI_TARGETS = [
  { target: 'darwin-arm64', label: 'macOS (Apple Silicon)' },
  { target: 'darwin-x64', label: 'macOS (Intel)' },
  { target: 'windows-x64', label: 'Windows x64' },
] as const;

const CLI_USAGE = [
  'continuum login --token cnt_…',
  'continuum upload ./cut.mp4 "/<Brand>/Library/"',
  'continuum download "/<Brand>/Library/cut.mp4"',
  'continuum watch ./card-dump "/<Brand>/Library/"',
  'continuum ls "/<Brand>/"',
];

export function DriveCliDownloads() {
  const tUi = useTranslations('settings');

  const apiBase = getApiBaseUrl();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {CLI_TARGETS.map(({ target, label }) => (
          <a
            key={target}
            data-testid="drive-cli-link"
            href={`${apiBase}/drive/v1/cli/${target}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Download aria-hidden />
            {label}
          </a>
        ))}
        <Pill variant="success">{tUi('m_75f527181b')}</Pill>
      </div>
      <div className="space-y-1.5">
        {CLI_USAGE.map((line) => (
          <CodeLine key={line}>{line}</CodeLine>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{tUi('m_c5ff5c88a9')}</p>
      <div data-testid="drive-cli-first-run" className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">{tUi('m_b1a0a31f94')}</h3>
          <p className="text-xs text-muted-foreground">{tUi('m_517422330b')}</p>
          <CodeLine>{tUi('m_1ec158d7af')}</CodeLine>
          <p className="text-xs text-muted-foreground">{tUi('m_d3ba456b18')}</p>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">{tUi('m_a4f1d28c3a')}</h3>
          <p className="text-xs text-muted-foreground">{tUi('m_da4b7e4592')}</p>
          <CodeLine>{tUi('m_2d1c008d17')}</CodeLine>
        </div>
      </div>
    </div>
  );
}
