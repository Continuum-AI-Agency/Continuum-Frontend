import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-gradient-to-r from-slate-200/70 via-slate-100 to-slate-200/70 [background-size:200%_100%] animate-[shimmer_1.6s_ease-in-out_infinite] motion-reduce:animate-pulse motion-reduce:bg-muted/70 motion-reduce:bg-none",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
