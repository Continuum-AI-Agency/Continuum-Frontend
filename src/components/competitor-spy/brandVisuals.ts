// Shared visual helpers for competitor "brand" rows across the rail, the smart
// search palette, and saved boards. Avatars are derived deterministically from
// the name (no stored logo): dark ink on a pale tint keeps contrast high.

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function tileStyle(name: string): { backgroundColor: string; color: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return {
    backgroundColor: `hsl(${hash} 42% 90%)`,
    color: `hsl(${hash} 38% 32%)`,
  };
}

export function compactCount(value: number | null | undefined): string | null {
  if (typeof value !== "number" || value <= 0) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value);
}
