'use client';
import { useTranslations } from 'next-intl';

import type React from 'react';
import { createContext, useCallback, useContext, useState } from 'react';
import { useShortcut } from '@/lib/keyboard/useShortcut';

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const uiText = useTranslations('navigation');
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  useShortcut(
    'command-palette',
    {
      key: 'k',
      meta: true,
      description: uiText('open_command_palette_c022b19'),
      allowInInput: true,
    },
    toggle,
  );

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  return ctx;
}
