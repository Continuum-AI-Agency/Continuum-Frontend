import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ImageStylePreset } from '../types';

interface StyleSelectorProps {
  value?: ImageStylePreset;
  onChange: (value: ImageStylePreset) => void;
}

const STYLES: { value: ImageStylePreset; label: string; image?: string }[] = [
  { value: 'none', label: 'No Style' },
  { value: 'photorealistic', label: 'Realistic' },
  { value: 'anime', label: 'Anime' },
  { value: '3d-render', label: '3D Render' },
  { value: 'cyberpunk', label: 'Cyberpunk' },
  { value: 'studio-ghibli', label: 'Ghibli' },
  { value: 'clay', label: 'Clay' },
];

export function StyleSelector({ value, onChange }: StyleSelectorProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {STYLES.map((style) => (
        <Card
          key={style.value}
          className={cn(
            'cursor-pointer p-2 flex flex-col items-center justify-center gap-1 border hover:border-primary/70 transition-all',
            value === style.value ? 'border-primary bg-primary/5' : 'border-slate-200',
          )}
          onClick={() => onChange(style.value)}
        >
          <div
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
              value === style.value ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500',
            )}
          >
            {style.label.charAt(0)}
          </div>
          <span className="text-2xs text-center font-medium leading-tight truncate w-full">
            {style.label}
          </span>
        </Card>
      ))}
    </div>
  );
}
