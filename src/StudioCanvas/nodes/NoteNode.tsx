'use client'

import React, { useCallback, useEffect, useRef } from 'react'
import { type NodeProps, type Node as ReactFlowNode, NodeResizer } from '@xyflow/react'
import { useStudioStore } from '../stores/useStudioStore'
import { cn } from '@/lib/utils'
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Copy, Trash2 } from 'lucide-react'
import { useDebouncedSave } from '../hooks/useDebouncedSave'

export interface NoteNodeData extends Record<string, unknown> {
  content: string
  label?: string
}

// Note nodes are standalone canvas annotations — no handles, not wired into
// the data-flow graph. Rich text is handled via contentEditable with execCommand
// bold toggle (⌘B / Ctrl+B). Content persists in node.data.content as HTML.
export function NoteNode({ id, data, selected }: NodeProps<ReactFlowNode<NoteNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData)
  const duplicateNode = useStudioStore((state) => state.duplicateNode)
  const deleteNode = useStudioStore((state) => state.deleteNode)
  const debouncedSave = useDebouncedSave()
  const editorRef = useRef<HTMLDivElement>(null)
  const isComposing = useRef(false)

  // Seed the DOM with persisted HTML on mount only. We do NOT re-apply on every
  // render to avoid clobbering the user's cursor position mid-edit. The initial
  // value is captured via a ref so we can safely omit data.content from deps.
  const initialContentRef = useRef((data.content as string) || '')
  useEffect(() => {
    if (!editorRef.current) return
    if (editorRef.current.innerHTML !== initialContentRef.current) {
      editorRef.current.innerHTML = initialContentRef.current
    }
  }, [])

  const handleInput = useCallback(() => {
    if (!editorRef.current || isComposing.current) return
    updateNodeData(id, { content: editorRef.current.innerHTML })
    debouncedSave()
  }, [id, updateNodeData, debouncedSave])

  const handleCompositionStart = useCallback(() => {
    isComposing.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    isComposing.current = false
    handleInput()
  }, [handleInput])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    // Prevent canvas shortcuts from firing while the user types
    event.stopPropagation()

    const isBold = (event.metaKey || event.ctrlKey) && event.key === 'b'
    if (isBold) {
      event.preventDefault()
      document.execCommand('bold')
    }
  }, [])

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    // Strip formatting — insert as plain text only
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }, [])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'relative min-w-[200px] min-h-[120px] w-full h-full max-w-[500px] rounded-lg transition-shadow'
          )}
        >
          <NodeResizer
            minWidth={200}
            minHeight={120}
            isVisible={selected}
            lineClassName="border-amber-400/60"
            handleClassName="h-3 w-3 bg-amber-400 border-2 border-background rounded-full"
          />

          <CanvasNode
            handles={{ target: false, source: false }}
            selected={selected}
            className={cn(
              'border border-amber-300/60 bg-amber-50/90 dark:bg-amber-950/40 rounded-lg overflow-hidden',
              'transition-all duration-300 h-full w-full flex flex-col min-h-[inherit] shadow-sm hover:shadow-md',
              selected && 'ring-2 ring-amber-400/60'
            )}
          >
            <NodeContent className="flex-1 flex flex-col min-h-0 p-0 bg-transparent">
              {/* biome-ignore lint/a11y/noStaticElementInteractions: contentEditable rich-text editor; a semantic textarea cannot support execCommand bold */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                className={cn(
                  'nodrag nopan flex-1 w-full min-h-[100px] p-3 text-sm text-foreground',
                  'outline-none resize-none bg-transparent overflow-y-auto whitespace-pre-wrap break-words',
                  '[&_b]:font-bold [&_strong]:font-bold empty:before:content-[attr(data-placeholder)]',
                  'empty:before:text-muted-foreground/50 empty:before:pointer-events-none'
                )}
                data-placeholder="Write a note…"
              />
              <div className="shrink-0 border-t border-amber-300/40 bg-amber-100/60 dark:bg-amber-900/20 px-3 py-1">
                <span className="text-2xs text-amber-700/70 dark:text-amber-400/70 select-none">
                  ⌘B bold
                </span>
              </div>
            </NodeContent>
          </CanvasNode>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        <ContextMenuLabel>Note</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => duplicateNode(id)}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicate
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => deleteNode(id)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
