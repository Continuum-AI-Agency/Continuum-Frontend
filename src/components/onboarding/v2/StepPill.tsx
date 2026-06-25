import { cn } from "@/lib/utils";

export type PillState = "done" | "active" | "pending";

type StepPillProps = {
  label: string;
  state: PillState;
  onClick?: () => void;
};

export function StepPill({ label, state, onClick }: StepPillProps) {
  const interactive = state !== "pending" && onClick;
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        state === "done" && "bg-[color-mix(in_srgb,var(--cs-teal,#0daea2)_12%,transparent)] text-[var(--cs-teal,#0daea2)]",
        state === "active" && "bg-[color-mix(in_srgb,var(--cs-violet,#5a39ff)_12%,transparent)] text-[var(--cs-violet,#5a39ff)]",
        state === "pending" && "cursor-default bg-muted text-muted-foreground",
        interactive && "cursor-pointer"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          state === "done" && "bg-[var(--cs-teal,#0daea2)]",
          state === "active" && "bg-[var(--cs-violet,#5a39ff)]",
          state === "pending" && "bg-muted-foreground"
        )}
      />
      {label}
    </button>
  );
}
