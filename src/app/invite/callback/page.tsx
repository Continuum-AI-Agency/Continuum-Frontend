"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildInviteLoginRedirect } from "@/lib/invites/urls";
import { normalizeInviteBrandId, normalizeInviteToken } from "@/lib/invites/params";
import posthog from "posthog-js";
import { getFunctionsInvokeErrorMessage } from "@/lib/supabase/functions-errors";

type InviteStatus = "idle" | "working" | "error";

export default function InviteCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<InviteStatus>("idle");
  const [message, setMessage] = useState<string>("Finalizing your invite...");
  const startedRef = useRef(false);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const token = normalizeInviteToken(searchParams.get("token"));
    const brandId = normalizeInviteBrandId(searchParams.get("brand"));

    if (!token || !brandId) {
      router.replace("/dashboard?invite=missing_params");
      return;
    }

    const finalizeInvite = async () => {
      setStatus("working");
      setMessage("Verifying your session...");

      const persistActiveBrandSelection = async (userId: string | undefined) => {
        if (!userId) return;

        const { error: preferenceError } = await supabase
          .schema("brand_profiles")
          .from("user_brand_preferences" as any)
          .upsert(
            {
              user_id: userId,
              active_brand_id: brandId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" } as any,
          );

        if (preferenceError) {
          throw new Error(preferenceError.message ?? "Unable to set active brand preference.");
        }

        const { error: metadataError } = await supabase.auth.updateUser({
          data: {
            onboarding: {
              activeBrandId: brandId,
            },
          },
        });

        if (metadataError) {
          console.warn("[invite] Active brand metadata update failed", metadataError);
        }
      };

      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setStatus("error");
        setMessage("Unable to verify session. Please sign in again.");
        router.replace(buildInviteLoginRedirect(token, brandId));
        return;
      }

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setStatus("error");
        setMessage("No active session. Redirecting to login...");
        router.replace(buildInviteLoginRedirect(token, brandId));
        return;
      }

      setMessage("Accepting your invite...");

      const { error } = await supabase.functions.invoke("brand_invite", {
        body: { action: "accept", token, brandId },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) {
        setStatus("error");
        const detailedMessage = await getFunctionsInvokeErrorMessage(error);

        const userId = sessionData.session?.user?.id;
        if (userId) {
          const { data: membership } = await supabase
            .schema("brand_profiles")
            .from("permissions")
            .select("id")
            .eq("brand_profile_id", brandId)
            .eq("user_id", userId)
            .maybeSingle();

          if (membership) {
            try {
              await persistActiveBrandSelection(userId);
            } catch (persistError) {
              const persistMessage = encodeURIComponent(
                persistError instanceof Error
                  ? persistError.message
                  : "Unable to activate invited brand.",
              );
              router.replace(`/dashboard?invite=error&message=${persistMessage}`);
              return;
            }

            router.replace("/dashboard?invite=accepted");
            return;
          }
        }

        const errorMessage = encodeURIComponent(detailedMessage ?? error.message ?? "invite_failed");
        router.replace(`/dashboard?invite=error&message=${errorMessage}`);
        return;
      }

      const userId = sessionData.session?.user?.id;
      try {
        await persistActiveBrandSelection(userId);
      } catch (persistError) {
        const persistMessage = encodeURIComponent(
          persistError instanceof Error
            ? persistError.message
            : "Unable to activate invited brand.",
        );
        router.replace(`/dashboard?invite=error&message=${persistMessage}`);
        return;
      }

      if (userId) {
        posthog.identify(userId);
      }
      posthog.capture("invite_accepted", { brand_id: brandId });
      router.replace("/dashboard?invite=accepted");
    };

    void finalizeInvite();
  }, [router, searchParams, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-black text-white">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold">Invite in progress</h1>
        <p className={status === "error" ? "text-red-300" : "text-white/70"}>{message}</p>
      </div>
    </div>
  );
}
