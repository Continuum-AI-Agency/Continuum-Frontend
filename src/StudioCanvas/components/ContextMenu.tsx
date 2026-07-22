import { useReactFlow } from '@xyflow/react';
import React, { useCallback, useEffect, useRef } from 'react';
import { ContextMenuItemInfo } from '@/components/ui/context-menu-item-info';
import { useStudioStore } from '../stores/useStudioStore';

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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onClick) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!menuRef.current || !target) return;
      if (!menuRef.current.contains(target)) {
        onClick();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClick();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClick]);

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
      ref={menuRef}
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
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-red-500 hover:bg-slate-100 dark:hover:bg-slate-900"
            onClick={clearCanvas}
          >
            <span>Clear Canvas</span>
            <ContextMenuItemInfo description="Canvas is the full working graph that holds all nodes and connections." />
          </button>
        ) : (
          <>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-900"
              onClick={duplicateNode}
            >
              <span>Duplicate</span>
              <ContextMenuItemInfo description="Duplicate keeps the same configuration so you can iterate variations faster." />
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-red-500 hover:bg-slate-100 dark:hover:bg-slate-900"
              onClick={handleDelete}
            >
              <span>Delete</span>
              <ContextMenuItemInfo description="Delete removes the node from the active graph and breaks its links." />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
