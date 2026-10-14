import { confirmForgeExit } from '@/components/forge/useForgeExitGuard';

export function navigateAfterForgeExit(
  href: string,
  navigate: (href: string) => void,
  confirm: () => Promise<boolean> = confirmForgeExit,
): void {
  void confirm().then((allowed) => {
    if (allowed) navigate(href);
  });
}
