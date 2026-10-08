'use client';

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

function formatTimestamp(value: string | null): string {
  if (!value) return 'never';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
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
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite" className={iconOnly ? 'sr-only' : undefined}>
        {copied ? 'Copied' : 'Copy'}
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
      setNameError('Give the token a name of 1–80 characters.');
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
            placeholder="Token name, e.g. Edit bay Mac"
            aria-label="Token name"
            maxLength={80}
          />
          {nameError ? <p className="text-xs text-destructive">{nameError}</p> : null}
        </div>
        <Button data-testid="drive-token-create" type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create token'}
        </Button>
      </form>
      {create.isError ? (
        <p className="text-sm text-destructive">Could not create the token. Try again.</p>
      ) : null}

      {revealed ? (
        <div
          data-testid="drive-token-reveal"
          className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3"
        >
          <p className="text-sm font-medium">
            Copy “{revealed.name}” now — it won’t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-background/60 px-2 py-1.5 font-mono text-xs">
              {revealed.token}
            </code>
            <CopyButton value={revealed.token} label="token" />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed(null)}>
            I’ve saved it
          </Button>
        </div>
      ) : null}

      {tokens.isPending ? (
        <p className="text-sm text-muted-foreground">Loading tokens…</p>
      ) : tokens.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">Could not load your tokens.</p>
          <Button variant="secondary" onClick={() => void tokens.refetch()}>
            Retry
          </Button>
        </div>
      ) : tokens.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tokens yet.</p>
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
                  {token.revokedAt ? <Pill variant="muted">Revoked</Pill> : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  Created {formatTimestamp(token.createdAt)} · last used{' '}
                  {formatTimestamp(token.lastUsedAt)}
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
                        Revoke
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke “{token.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Any mounted drive or continuum CLI signed in with this token stops working
                        immediately. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => revoke.mutate(token.id)}
                      >
                        Revoke token
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </li>
          ))}
        </ul>
      )}
      {revoke.isError ? (
        <p className="text-sm text-destructive">Could not revoke the token. Try again.</p>
      ) : null}
    </div>
  );
}

/** How to mount a brand drive on each OS — shown from the Brand drives "How to connect" hint. */
export function DriveConnectSteps({ email }: { email: string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">macOS</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>In Finder, choose Go → Connect to Server (⌘K).</li>
            <li>Paste a brand’s mount URL (open the brand’s row to copy it) and click Connect.</li>
            <li>
              Name: <span className="text-foreground">{email}</span>. Password: an app token.
            </li>
          </ol>
          <p data-testid="drive-mac-free-space" className="text-xs text-muted-foreground">
            Finder shows 0 free space on the drive. That is on purpose: macOS holds a network drive
            for 90 seconds before you can open it whenever the server reports a storage limit, so
            Drive doesn’t report one to Macs. Finder still copies onto it. Your allowance still
            applies — the Library’s storage meter and <code>continuum quota</code> show it, and an
            upload that would go over it is refused.
          </p>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">Windows</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>In File Explorer, open This PC → Map network drive.</li>
            <li>Folder: paste a brand’s mount URL.</li>
            <li>Tick “Connect using different credentials”, then Finish.</li>
            <li>
              User name: <span className="text-foreground">{email}</span>. Password: an app token.
            </li>
          </ol>
          <p data-testid="drive-windows-size-limit" className="text-xs text-muted-foreground">
            Windows refuses files over 50 MB on a network drive by default (the WebClient
            FileSizeLimitInBytes setting). To lift it to 4 GB, run in an administrator PowerShell,
            then reconnect:
          </p>
          <CodeLine>
            {
              'Set-ItemProperty HKLM:\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters FileSizeLimitInBytes 4294967295; Restart-Service WebClient'
            }
          </CodeLine>
          <p className="text-xs text-muted-foreground">
            Larger files: use the continuum command-line app below.
          </p>
        </div>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Files open by downloading to your computer’s cache first — they are not streamed.</li>
        <li>
          Saving a file with the same name creates a new version of that asset; its comments and
          approvals stay attached.
        </li>
        <li>New folders under Collections become collections.</li>
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
        <Pill variant="success">Free</Pill>
      </div>
      <div className="space-y-1.5">
        {CLI_USAGE.map((line) => (
          <CodeLine key={line}>{line}</CodeLine>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Uploads and downloads resume where they left off after a dropped connection. Sign in with an
        app token from above.
      </p>
      <div data-testid="drive-cli-first-run" className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">First run on a Mac</h3>
          <p className="text-xs text-muted-foreground">
            The app is not notarized by Apple yet, so Gatekeeper blocks the downloaded file. In
            Terminal, clear the quarantine flag and make it executable once:
          </p>
          <CodeLine>
            {
              'xattr -d com.apple.quarantine ~/Downloads/continuum-darwin-*; chmod +x ~/Downloads/continuum-darwin-*'
            }
          </CodeLine>
          <p className="text-xs text-muted-foreground">
            Or open it once from Finder with Control-click → Open, then Open again.
          </p>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">First run on Windows</h3>
          <p className="text-xs text-muted-foreground">
            The app is not code-signed yet, so SmartScreen may say “Windows protected your PC”.
            Choose More info → Run anyway, or unblock it once in PowerShell:
          </p>
          <CodeLine>{'Unblock-File $HOME\\Downloads\\continuum-windows-x64.exe'}</CodeLine>
        </div>
      </div>
    </div>
  );
}
