'use client';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

interface EditableAmountProps {
  value: number;
  currency?: string;
  onSave: (newValue: number) => void;
  className?: string;
}

export const EditableAmount = ({
  value,
  currency = 'USD',
  onSave,
  className,
}: EditableAmountProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    const numericValue = parseFloat(inputValue);
    if (!isNaN(numericValue) && numericValue !== value) {
      onSave(numericValue);
    } else {
      setInputValue(value.toString());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      const numericValue = parseFloat(inputValue);
      if (!isNaN(numericValue) && numericValue !== value) {
        onSave(numericValue);
      }
    } else if (e.key === 'Escape') {
      setInputValue(value.toString());
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center justify-center gap-1">
        <span className="text-xl font-bold opacity-50">$</span>
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="h-8 w-24 text-xl font-bold text-center border-none focus-visible:ring-1 focus-visible:ring-ring bg-background/50"
        />
      </div>
    );
  }

  return (
    <h3 onDoubleClick={handleDoubleClick} className={className}>
      {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)}
    </h3>
  );
};
