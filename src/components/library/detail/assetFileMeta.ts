// Pure display helpers for file-kind assets (source files with no preview),
// shared by the grid tile and the detail stage.

export function fileExtension(fileName: string): string | null {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0 || dot === trimmed.length - 1) return null;
  const ext = trimmed.slice(dot + 1);
  return ext.length > 5 ? null : ext.toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}
