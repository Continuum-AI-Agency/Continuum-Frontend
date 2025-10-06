"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { getLocalStorageJSON, setLocalStorageJSON } from "./storage";

export function usePersistentState<T>(key: string, fallback: T, schema?: z.ZodType<T>) {
  const [value, setValue] = useState<T>(() => getLocalStorageJSON<T>(key, fallback, schema));

  useEffect(() => {
    setLocalStorageJSON<T>(key, value);
  }, [key, value]);

  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof next === "function" ? (next as (p: T) => T)(prev) : next));
  }, []);

  return [value, update] as const;
}


