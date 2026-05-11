type BottomBarProps = {
  hint: string;
  actions: React.ReactNode;
};

export function BottomBar({ hint, actions }: BottomBarProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[#e5e7eb] bg-white px-6 py-3">
      <span className="max-w-[260px] text-[11px] leading-snug text-[#94a3b8]">{hint}</span>
      <div className="flex items-center gap-2.5">{actions}</div>
    </div>
  );
}
