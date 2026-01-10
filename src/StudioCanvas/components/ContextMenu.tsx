import React, { useCallback } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { useStudioStore } from '../stores/useStudioStore';
import {
  ContextMenu as UIContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface ContextMenuProps {
  id: string;
  top: number;
  left: number;
  right?: number;
  bottom?: number;
  onClick?: () => void;
}

export function ContextMenu({ id, top, left, right, bottom, onClick }: ContextMenuProps) {
  const { getNode, deleteElements, addNodes } = useReactFlow();
  const { setNodes } = useStudioStore();

  const duplicateNode = useCallback(() => {
    const node = getNode(id);
    if (!node) return;

    const position = {
      x: node.position.x + 50,
      y: node.position.y + 50,
    };

    const newNode = {
      ...node,
      id: `${node.id}-copy-${Date.now()}`,
      position,
      selected: false,
      data: { ...node.data },
    };

    addNodes(newNode);
  }, [id, getNode, addNodes]);

  const handleDelete = useCallback(() => {
    const node = getNode(id);
    if (!node) return;
    deleteElements({ nodes: [node] });
  }, [id, getNode, deleteElements]);

  const clearCanvas = useCallback(() => {
    setNodes([]);
  }, [setNodes]);

  const isPaneMenu = id === 'pane';

  return (
    <div
      style={{
        top,
        left,
        right,
        bottom,
        position: 'fixed',
        zIndex: 1000,
      }}
      className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md shadow-md p-1 min-w-[150px]"
      onClick={onClick}
    >
      <div className="flex flex-col text-sm">
        {isPaneMenu ? (
          <button
            className="text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-sm w-full text-red-500"
            onClick={clearCanvas}
          >
            Clear Canvas
          </button>
        ) : (
          <>
            <button
              className="text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-sm w-full"
              onClick={duplicateNode}
            >
              Duplicate
            </button>
            <button
              className="text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-sm w-full text-red-500"
              onClick={handleDelete}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
