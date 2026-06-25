type BottomBarProps = {
  hint: string;
  actions: React.ReactNode;
};

export function BottomBar({ hint, actions }: BottomBarProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border bg-white dark:bg-card px-6 py-3">
      <span className="max-w-[260px] text-xs leading-snug text-muted-foreground">{hint}</span>
      <div className="flex items-center gap-2.5">{actions}</div>
    </div>
  );
}
