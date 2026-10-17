'use client';

// The sidebar's theme toggle shows the mode it switches TO: a sun in dark mode, a moon in light.
// The server renders `appearance = 'light'` (it has no DOM to read), while the client's root
// already carries `html.dark` from the blocking theme script — so a JS-chosen glyph mismatched
// on every dark-mode load (PP-L1-hydration-mismatch-on-scale: 52 "Hydration failed" per visual
// matrix, the whole shell regenerated on the client). Until hydration settles both glyphs are
// in the markup and `dark:` picks one, which is the same at both ends; after it the JS branch
// takes over so the toggle keeps its crossfade.

import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useHydrated } from '@/hooks/useHydrated';
import type { ThemeAppearance } from '@/lib/theme/themeDom';

const GLYPH = '!h-[18px] !w-[18px] stroke-[1.8]';

export function themeToggleLabel(appearance: ThemeAppearance): string {
  return appearance === 'dark' ? 'Light mode' : 'Dark mode';
}

export function ThemeToggleGlyph({
  appearance,
  reduce,
}: {
  appearance: ThemeAppearance;
  reduce: boolean | null;
}) {
  const hydrated = useHydrated();
  return (
    <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={hydrated ? appearance : 'pre-hydration'}
          initial={reduce ? false : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
          transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
          className="absolute inset-0 inline-flex items-center justify-center"
        >
          {hydrated ? (
            appearance === 'dark' ? (
              <Sun className={GLYPH} />
            ) : (
              <Moon className={GLYPH} />
            )
          ) : (
            <>
              <Sun className={`${GLYPH} hidden dark:inline-block`} />
              <Moon className={`${GLYPH} dark:hidden`} />
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** The toggle's text, neutral until hydration for the same reason as the glyph. */
export function ThemeToggleText({ appearance }: { appearance: ThemeAppearance }) {
  const hydrated = useHydrated();
  if (hydrated) return <>{themeToggleLabel(appearance)}</>;
  return (
    <>
      <span className="dark:hidden">{themeToggleLabel('light')}</span>
      <span className="hidden dark:inline">{themeToggleLabel('dark')}</span>
    </>
  );
}
