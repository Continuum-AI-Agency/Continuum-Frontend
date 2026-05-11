import Image from "next/image";
import { useEffect, useState } from "react";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { createSignedAssetUrl } from "@/lib/creative-assets/storageClient";

export function LogoSlot() {
  const { state } = useOnboarding();
  const path = state.brand.logoPath;
  const name = state.brand.name || "Brand";
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setResolvedUrl(null);
      return;
    }
    if (/^https?:\/\//i.test(path)) {
      setResolvedUrl(path);
      return;
    }
    let active = true;
    createSignedAssetUrl(path, 3600)
      .then((url) => {
        if (active) setResolvedUrl(url);
      })
      .catch(() => active && setResolvedUrl(null));
    return () => {
      active = false;
    };
  }, [path]);

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#0b1220]">
      {resolvedUrl ? (
        <Image
          src={resolvedUrl}
          alt={`${name} logo`}
          width={48}
          height={48}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        <span className="text-base font-bold text-white">{name.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}
