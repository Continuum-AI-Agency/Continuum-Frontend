import * as React from "react"
import { cn } from "@/lib/utils"

const Empty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col items-center justify-center p-4 text-center h-full w-full", className)}
    {...props}
  />
))
Empty.displayName = "Empty"

const EmptyHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col items-center gap-1", className)}
    {...props}
  />
))
EmptyHeader.displayName = "EmptyHeader"

const EmptyMedia = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "icon" }
>(({ className, variant = "default", children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center justify-center",
      variant === "icon" && "h-10 w-10 rounded-full bg-muted text-muted-foreground mb-2",
      className
    )}
    {...props}
  >
    {variant === "icon" ? React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
            return React.cloneElement(child, { className: cn("h-5 w-5", (child.props as any).className) } as any)
        }
        return child
    }) : children}
  </div>
))
EmptyMedia.displayName = "EmptyMedia"

const EmptyTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-sm font-semibold tracking-tight", className)}
    {...props}
  />
))
EmptyTitle.displayName = "EmptyTitle"

const EmptyDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-muted-foreground", className)}
    {...props}
  />
))
EmptyDescription.displayName = "EmptyDescription"

const EmptyContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("mt-2", className)}
    {...props}
  />
))
EmptyContent.displayName = "EmptyContent"

export { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent }
