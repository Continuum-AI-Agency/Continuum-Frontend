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
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
        state === "done" && "bg-[color-mix(in_srgb,#0daea2_12%,transparent)] text-[#0daea2]",
        state === "active" && "bg-[color-mix(in_srgb,#5a39ff_12%,transparent)] text-[#5a39ff]",
        state === "pending" && "cursor-default bg-[#f2f4f8] text-[#64748b]",
        interactive && "cursor-pointer"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          state === "done" && "bg-[#0daea2]",
          state === "active" && "bg-[#5a39ff]",
          state === "pending" && "bg-[#94a3b8]"
        )}
      />
      {label}
    </button>
  );
}
