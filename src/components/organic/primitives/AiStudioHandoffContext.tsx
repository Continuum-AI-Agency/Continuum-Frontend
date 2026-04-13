"use client"

import * as React from "react"

type OpenDraftFn = (draftId: string) => void

const AiStudioHandoffContext = React.createContext<OpenDraftFn | null>(null)

export function AiStudioHandoffProvider({
  onOpen,
  children,
}: {
  onOpen: OpenDraftFn | null
  children: React.ReactNode
}) {
  return (
    <AiStudioHandoffContext.Provider value={onOpen}>
      {children}
    </AiStudioHandoffContext.Provider>
  )
}

export function useOpenDraftInAiStudio(): OpenDraftFn | null {
  return React.useContext(AiStudioHandoffContext)
}
