"use client";

import { TextArea } from "@radix-ui/themes";
import { forwardRef } from "react";

interface FormTextareaProps extends React.ComponentPropsWithoutRef<typeof TextArea> {
  label: string;
  error?: string;
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ label, error, ...props }, ref) => {
    return (
      <div className="space-y-2">
        <label 
          htmlFor={props.id} 
          className="block text-sm font-semibold text-gray-800 dark:text-gray-100"
        >
          {label}
        </label>
        <TextArea
          {...props}
          ref={ref}
          size="3"
          className={`w-full transition-all duration-200 ${
            error 
              ? "ring-2 ring-red-500 border-red-500" 
              : "border-gray-300 dark:border-gray-600 focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-purple-500"
          }`}
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
      </div>
    );
  }
);

FormTextarea.displayName = "FormTextarea";

