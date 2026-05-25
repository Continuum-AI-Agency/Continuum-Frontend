import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type HorizontalRowProps = {
  label: string;
  children: ReactNode;
  className?: string;
  itemClassName?: string;
};

export function HorizontalRow({
  label,
  children,
  className,
  itemClassName,
}: HorizontalRowProps) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <h3 className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
        {label}
      </h3>
      <div
        className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#e5e7eb]"
      >
        {Children.map(children, (child, idx) =>
          child == null || child === false ? null : (
            <div
              key={idx}
              className={cn(
                "flex max-h-[440px] w-[clamp(280px,42vw,380px)] shrink-0 snap-start flex-col overflow-y-auto",
                itemClassName,
              )}
            >
              {child}
            </div>
          ),
        )}
      </div>
    </section>
  );
}
