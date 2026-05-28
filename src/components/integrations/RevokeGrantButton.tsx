"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/ToastProvider";
import { revokeIntegrationFromBrandAction } from "@/app/(post-auth)/settings/integrations/actions";

type RevokeGrantButtonProps = {
  grantId: string;
  brandProfileId: string;
  integrationLabel: string;
};

export function RevokeGrantButton({ grantId, brandProfileId, integrationLabel }: RevokeGrantButtonProps) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, setIsPending] = React.useState(false);

  const handleRevoke = async () => {
    setIsPending(true);
    try {
      await revokeIntegrationFromBrandAction(grantId, brandProfileId);
      show({
        title: "Access revoked",
        description: `${integrationLabel} is no longer shared with this brand.`,
      });
      router.refresh();
    } catch (error) {
      show({
        title: "Could not revoke access",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "error",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleRevoke} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
      <span className="ml-1.5">Revoke</span>
    </Button>
  );
}
