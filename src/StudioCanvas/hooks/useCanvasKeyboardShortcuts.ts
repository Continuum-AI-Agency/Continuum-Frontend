import { useReactFlow } from '@xyflow/react';
import { useEffect } from 'react';

import { useStudioStore } from '../stores/useStudioStore';

// Canvas-level keyboard: undo/redo, clipboard, the pan/select mode letters, and
// Delete. Lifted out of StudioCanvas so the shell holds wiring rather than key
// codes; it reads the store itself rather than taking ten props.
export function useCanvasKeyboardShortcuts(): void {
  const {
    nodes,
    edges,
    takeSnapshot,
    undo,
    redo,
    setInteractionMode,
    keyboardScope,
    copySelectedNodes,
    cutSelectedNodes,
    pasteNodes,
  } = useStudioStore();
  const { deleteElements } = useReactFlow();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // A full-screen editor (e.g. the Video Editor dialog) owns the keyboard
      // while open. Standing down here keeps Delete/Backspace, copy/paste, and
      // undo from acting on the canvas node behind the editor.
      if (keyboardScope === 'modal') {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        event.preventDefault();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'y') {
        redo();
        event.preventDefault();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'c') {
        copySelectedNodes();
        event.preventDefault();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'x') {
        cutSelectedNodes();
        event.preventDefault();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'v') {
        pasteNodes();
        event.preventDefault();
        return;
      }

      if (event.key.toLowerCase() === 'h') {
        setInteractionMode('pan');
        return;
      }

      if (event.key.toLowerCase() === 'v') {
        setInteractionMode('select');
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodes = nodes.filter((node) => node.selected);
        const selectedEdges = edges.filter((edge) => edge.selected);

        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          takeSnapshot();
          deleteElements({ nodes: selectedNodes, edges: selectedEdges });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    copySelectedNodes,
    cutSelectedNodes,
    deleteElements,
    edges,
    keyboardScope,
    nodes,
    pasteNodes,
    redo,
    setInteractionMode,
    takeSnapshot,
    undo,
  ]);
}
