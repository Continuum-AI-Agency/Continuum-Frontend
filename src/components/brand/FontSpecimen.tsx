'use client';

// Draws a typeface from a font file the person picked on their own machine. Nothing is
// fetched and no URL is minted: the bytes are already theirs, so this is not the
// redistribution typefaceHonesty.tsx refuses, and it is their real face, not a substitute.
// A face we only hold server-side still gets no specimen.

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const SAMPLE = 'Aa Bb Cc Gg Rr 0123 &?!';

export function FontSpecimen({ file, className }: { file: File; className?: string }) {
  const translate = useTranslations('common');
  const [family, setFamily] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    let live = true;
    let face: FontFace | null = null;
    const name = `specimen-${crypto.randomUUID()}`;
    setFamily(null);
    setUnreadable(false);
    file
      .arrayBuffer()
      .then((bytes) => new FontFace(name, bytes).load())
      .then((loaded) => {
        if (!live) return;
        face = loaded;
        document.fonts.add(loaded);
        setFamily(name);
      })
      .catch(() => {
        if (live) setUnreadable(true);
      });
    return () => {
      live = false;
      if (face) document.fonts.delete(face);
    };
  }, [file]);

  if (unreadable) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)} data-testid="font-specimen">
        {translate('fontSpecimenUnreadable')}
      </p>
    );
  }
  return (
    <p
      data-testid="font-specimen"
      data-ready={family ? 'true' : 'false'}
      aria-hidden
      className={cn(
        'truncate text-2xl leading-tight text-foreground',
        !family && 'invisible',
        className,
      )}
      style={family ? { fontFamily: `"${family}"` } : undefined}
    >
      {SAMPLE}
    </p>
  );
}
