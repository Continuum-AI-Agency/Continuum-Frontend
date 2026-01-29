"use client";

import { JainaChatSurface } from "@/components/paid-media/jaina/JainaChatSurface";

type PaidMediaClientPageProps = {
  brandProfileId: string;
  brandName: string;
};

export default function PaidMediaClientPage({ brandProfileId, brandName }: PaidMediaClientPageProps) {
  return (
    <div className="w-full max-w-none px-3 sm:px-4 lg:px-6 py-6 h-full min-h-0">
      <JainaChatSurface brandProfileId={brandProfileId} brandName={brandName} />
    </div>
  );
}
