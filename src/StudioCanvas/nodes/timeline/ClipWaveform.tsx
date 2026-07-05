// A compact audio waveform for a timeline clip, drawn as a single mirrored SVG
// path (no per-bar nodes) so it scales to any clip width via preserveAspectRatio.

function buildWaveformPath(peaks: number[]): string {
  const mid = 10;
  const count = peaks.length;
  let path = `M 0 ${mid}`;
  for (let i = 0; i < count; i += 1) path += ` L ${i} ${(mid - peaks[i] * mid).toFixed(2)}`;
  for (let i = count - 1; i >= 0; i -= 1) path += ` L ${i} ${(mid + peaks[i] * mid).toFixed(2)}`;
  return `${path} Z`;
}

export function ClipWaveform({ peaks, className }: { peaks: number[]; className?: string }) {
  if (peaks.length === 0) return null;
  return (
    <svg
      viewBox={`0 0 ${Math.max(1, peaks.length - 1)} 20`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <path d={buildWaveformPath(peaks)} className="fill-current" />
    </svg>
  );
}
