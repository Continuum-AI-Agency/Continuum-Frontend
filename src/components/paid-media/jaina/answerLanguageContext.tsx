'use client';

// The answer's language, handed to the blocks through context rather than a prop.
//
// `answerLanguage` is decided once per report in `JainaReportV2`; the blocks that print a
// word of their own — the tile's read ("mejor" / "better"), the narrative's three box labels
// — sit behind `BlockRenderer`'s lazy boundary, which takes `{ block, isStreaming }` and
// nothing else. A context is the same route `ExportModeContext` and `EntityNamesProvider`
// already take for the same reason. English is the floor when nothing provided one, exactly
// as `answerLanguage` falls to English when the report says nothing.

import { createContext, type ReactNode, useContext } from 'react';
import type { AnswerLanguage } from './answerLanguage';

const AnswerLanguageContext = createContext<AnswerLanguage>('en');

export function AnswerLanguageProvider({
  language,
  children,
}: {
  language: AnswerLanguage;
  children: ReactNode;
}) {
  return (
    <AnswerLanguageContext.Provider value={language}>{children}</AnswerLanguageContext.Provider>
  );
}

export function useAnswerLanguage(): AnswerLanguage {
  return useContext(AnswerLanguageContext);
}
