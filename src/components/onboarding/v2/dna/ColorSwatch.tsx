type ColorSwatchProps = { hex: string };

export function ColorSwatch({ hex }: ColorSwatchProps) {
  const isLight = isLightColor(hex);
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="h-[30px] w-[30px] rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
        style={{ background: hex, border: isLight ? "1px solid #e5e7eb" : undefined }}
      />
      <span className="font-mono text-[9px] font-semibold text-[#94a3b8]">{hex}</span>
    </div>
  );
}

function isLightColor(hex: string): boolean {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.92;
}
