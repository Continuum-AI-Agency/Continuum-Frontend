import React from 'react';
import { cn } from '@/lib/utils';
import { PlusIcon, Cross2Icon } from '@radix-ui/react-icons';
import { FrameSlot } from '../types';
import { Handle, Position } from '@xyflow/react';

interface FrameStripProps {
  frames: FrameSlot[];
  onFrameClick: (index: number) => void;
  onRemoveFrame: (index: number) => void;
  activeFrameIndex?: number;
}

export function FrameStrip({ frames, onFrameClick, onRemoveFrame, activeFrameIndex }: FrameStripProps) {
  const slots = Array.from({ length: 9 }, (_, i) => frames[i]);

  return (
    <div className="flex gap-1 overflow-x-auto p-1 bg-slate-50 rounded-md border border-slate-200">
      {slots.map((frame, index) => (
        <div 
          key={index}
          className={cn(
            "relative w-12 h-16 flex-shrink-0 rounded bg-white border border-dashed border-slate-300 flex items-center justify-center group cursor-pointer transition-colors",
            frame ? "border-solid border-indigo-200" : "hover:border-indigo-300",
            activeFrameIndex === index && "ring-2 ring-indigo-500 ring-offset-1"
          )}
          onClick={() => onFrameClick(index)}
        >
          <Handle 
             type="target" 
             position={Position.Bottom} 
             id={`frame-${index}`}
             className={cn(
               "!w-2 !h-2 !bg-slate-300 transition-colors",
               frame ? "!bg-indigo-500" : ""
             )}
             style={{ bottom: -6 }}
          />

          {frame?.src ? (
            <>
              {frame.type === 'video' ? (
                <video src={frame.src} className="w-full h-full object-cover rounded-[3px]" />
              ) : (
                <img src={frame.src} alt={`Frame ${index + 1}`} className="w-full h-full object-cover rounded-[3px]" />
              )}
              
              <button 
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFrame(index);
                }}
              >
                <Cross2Icon className="w-3 h-3" />
              </button>
            </>
          ) : (
            <span className="text-[10px] text-slate-400 font-mono">{index + 1}</span>
          )}
        </div>
      ))}
      
      {frames.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-slate-400 opacity-50">Drag inputs to slots below</span>
        </div>
      )}
    </div>
  );
}
