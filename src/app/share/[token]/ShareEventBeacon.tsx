'use client';

// Reports what only the browser sees — the link opened, an asset scrolled into
// view, a video started — to /share/<token>/events. Each fires once per page.

import { type ReactNode, useEffect, useRef } from 'react';

function beacon(token: string, body: { kind: 'open' | 'view' | 'play'; assetId?: string; versionId?: string }) {
  void fetch(`/share/${token}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}

export function ShareOpenBeacon({ token }: { token: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    beacon(token, { kind: 'open' });
  }, [token]);
  return null;
}

export function ShareAssetBeacon({
  token,
  assetId,
  versionId,
  className,
  children,
}: {
  token: string;
  assetId: string;
  versionId: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);
  const played = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (viewed.current || !entries.some((entry) => entry.isIntersecting)) return;
        viewed.current = true;
        beacon(token, { kind: 'view', assetId, versionId });
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    // `play` does not bubble; a capturing listener hears every video inside the tile.
    const onPlay = () => {
      if (played.current) return;
      played.current = true;
      beacon(token, { kind: 'play', assetId, versionId });
    };
    node.addEventListener('play', onPlay, true);
    return () => {
      observer.disconnect();
      node.removeEventListener('play', onPlay, true);
    };
  }, [token, assetId, versionId]);

  return (
    <div ref={ref} className={className} data-share-asset={assetId}>
      {children}
    </div>
  );
}
