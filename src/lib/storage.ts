import { z } from "zod";

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function makeScopedKey(scope: string, name: string): string {
  return `${scope}:${name}`;
}

export function getLocalStorageJSON<T>(key: string, fallback: T, schema?: z.ZodType<T>): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (schema) {
      return schema.parse(parsed);
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function setLocalStorageJSON<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    const raw = JSON.stringify(value);
    window.localStorage.setItem(key, raw);
  } catch {
    // ignore
  }
}

export function removeLocalStorage(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}


