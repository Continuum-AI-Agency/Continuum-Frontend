import Image from "next/image";
import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";

type BrandIdentityHeaderProps = {
  brandId: string;
  name: string;
  logoUrl: string | null;
};

export function BrandIdentityHeader({
  brandId,
  name,
  logoUrl,
}: BrandIdentityHeaderProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="mb-5 flex items-center gap-3 rounded-lg border border-border/50 bg-card/30 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-sm font-semibold uppercase text-muted-foreground">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt=""
            width={36}
            height={36}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          initial
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {brandId}
        </p>
      </div>
      <Link
        href="/settings?section=brands"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <ArrowLeftRight className="h-3 w-3" aria-hidden />
        Switch brand
      </Link>
    </div>
  );
}
