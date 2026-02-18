import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface EditableLabelProps {
  value: string;
  onSave: (newValue: string) => void;
  className?: string;
}

export const EditableLabel = ({ value, onSave, className }: EditableLabelProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value);
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
    if (inputValue !== value) {
      onSave(inputValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      if (inputValue !== value) {
        onSave(inputValue);
      }
    } else if (e.key === 'Escape') {
      setInputValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="h-6 px-1 py-0 text-inherit font-inherit border-none focus-visible:ring-1 focus-visible:ring-ring bg-background/50"
      />
    );
  }

  return (
    <span onDoubleClick={handleDoubleClick} className={className}>
      {value}
    </span>
  );
};
