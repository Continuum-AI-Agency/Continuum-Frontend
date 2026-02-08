import type { Experimental_GeneratedImage } from "ai";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type ImageProps = ComponentProps<"img"> & Experimental_GeneratedImage;

export const Image = ({
  base64,
  uint8Array,
  mediaType,
  className,
  alt,
  ...props
}: ImageProps) => {
  const src = base64 
    ? `data:${mediaType};base64,${base64}` 
    : uint8Array 
    ? URL.createObjectURL(new Blob([uint8Array], { type: mediaType }))
    : "";

  return (
    <img
      {...props}
      alt={alt}
      className={cn(
        "h-auto max-w-full overflow-hidden rounded-md border bg-muted",
        className
      )}
      src={src}
    />
  );
};

