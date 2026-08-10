'use client';
import { Minus, Plus, Table } from 'lucide-react';

import React from 'react';

import { Button } from '@/components/ui/button';

type ZoomControlsProps = {
  instance: any;
};

export function ZoomControls({ instance }: ZoomControlsProps) {
  return (
    <div className="absolute bottom-4 right-4 z-50">
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          size="sm"
          onClick={() => instance.zoomIn?.({ duration: 300 })}
          className="w-8 h-8 p-0"
          aria-label="Zoom in"
        >
          <Plus />
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => instance.zoomOut?.({ duration: 300 })}
          className="w-8 h-8 p-0"
          aria-label="Zoom out"
        >
          <Minus />
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => instance.fitView?.({ padding: 0.1, duration: 300 })}
          className="w-8 h-8 p-0"
          aria-label="Fit view"
        >
          <Table />
        </Button>
      </div>
    </div>
  );
}
