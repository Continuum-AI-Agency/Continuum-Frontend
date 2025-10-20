"use client";

import { ExclamationTriangleIcon, CheckCircledIcon } from "@radix-ui/react-icons";

interface FormAlertProps {
  message: string;
  variant?: "error" | "success";
}

export function FormAlert({ message, variant = "error" }: FormAlertProps) {
  const isError = variant === "error";
  
  return (
    <div 
      className={`mb-6 p-4 rounded-xl border-2 flex items-start gap-3 ${
        isError
          ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
          : "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
      }`}
      role="alert"
    >
      <div className={`flex-shrink-0 mt-0.5 ${
        isError 
          ? "text-red-600 dark:text-red-400" 
          : "text-green-600 dark:text-green-400"
      }`}>
        {isError ? (
          <ExclamationTriangleIcon className="w-5 h-5" />
        ) : (
          <CheckCircledIcon className="w-5 h-5" />
        )}
      </div>
      <p className={`text-sm font-medium leading-relaxed ${
        isError 
          ? "text-red-800 dark:text-red-200" 
          : "text-green-800 dark:text-green-200"
      }`}>
        {message}
      </p>
    </div>
  );
}

