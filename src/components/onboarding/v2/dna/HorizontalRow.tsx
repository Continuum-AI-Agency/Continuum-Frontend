import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type HorizontalRowProps = {
  label: string;
  children: ReactNode;
  className?: string;
  itemClassName?: string;
  layout?: "scroll" | "grid";
};

export function HorizontalRow({
  label,
  children,
  className,
  itemClassName,
  layout = "scroll",
}: HorizontalRowProps) {
  const items = Children.map(children, (child, idx) =>
    child == null || child === false ? null : (
      <div
        key={idx}
        className={cn(
          layout === "grid"
            ? "flex w-full flex-col"
            : "flex max-h-[440px] w-[clamp(320px,30vw,440px)] shrink-0 snap-start flex-col overflow-y-auto",
          itemClassName,
        )}
      >
        {child}
      </div>
    ),
  );

  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <h3 className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
        {label}
      </h3>
      {layout === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{items}</div>
      ) : (
        <div className="relative">
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#e5e7eb]">
            {items}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#f9fafb] to-transparent"
          />
        </div>
      )}
    </section>
  );
}
