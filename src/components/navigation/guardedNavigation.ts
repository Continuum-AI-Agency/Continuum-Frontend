import { confirmForgeExit } from '@/components/forge/useForgeExitGuard';

export function runAfterForgeExit(
  action: () => void,
  confirm: () => Promise<boolean> = confirmForgeExit,
): void {
  void confirm().then((allowed) => {
    if (allowed) action();
  });
}

export function navigateAfterForgeExit(
  href: string,
  navigate: (href: string) => void,
  confirm: () => Promise<boolean> = confirmForgeExit,
): void {
  runAfterForgeExit(() => navigate(href), confirm);
}
