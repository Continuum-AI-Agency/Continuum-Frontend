// The branded frame for a share link's gate screens (passcode/identity
// challenge, expired or revoked card): the link's logo, accent, background and
// theme, and the Continuum footer unless the link hides it.

import type { CSSProperties, ReactNode } from 'react';
import type { SharePresentation } from './loadSharePayload';

export function ShareBrandShell({
  presentation,
  children,
}: {
  presentation: SharePresentation | null;
  children: ReactNode;
}) {
  const style = {
    ...(presentation?.accent ? { '--primary': presentation.accent } : {}),
    ...(presentation?.background ? { '--background': presentation.background } : {}),
  } as CSSProperties;
  const name = presentation?.title ?? presentation?.brandName ?? null;
  return (
    <div
      data-share-shell
      data-theme={presentation?.theme ?? undefined}
      style={style}
      className="min-h-screen bg-background text-foreground"
    >
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10">
        {presentation?.logoUrl || name ? (
          <header className="flex flex-col items-center gap-2 text-center">
            {presentation?.logoUrl ? (
              // Signed storage URL, cross-origin and short-lived; next/image adds nothing.
              <img
                src={presentation.logoUrl}
                alt={presentation.brandName ?? 'Brand logo'}
                data-share-logo
                className="h-10 w-auto max-w-40 object-contain"
              />
            ) : null}
            {name ? <p className="text-sm font-medium text-foreground">{name}</p> : null}
          </header>
        ) : null}
        {children}
        {presentation?.hideFooter ? null : (
          <p data-share-footer className="text-center text-xs text-muted-foreground">
            Shared via Continuum
          </p>
        )}
      </main>
    </div>
  );
}
