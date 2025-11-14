"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { openCenteredPopup, waitForPopupMessage } from "@/lib/popup";
import { buildOAuthStartUrl } from "@/lib/oauth";
import { useToast } from "@/components/ui/ToastProvider";

export default function GoogleOAuthButton() {
  const router = useRouter();
  const { show } = useToast();
  const [pending, setPending] = useState(false);

  const handleGoogleLogin = () => {
    if (pending) return;
    setPending(true);

    const popupUrl = buildOAuthStartUrl("google", "auth");
    const popup = openCenteredPopup(popupUrl, "Continue with Google");
    if (!popup) {
      show({ title: "Popup blocked", description: "Enable popups to continue with Google.", variant: "error" });
      setPending(false);
      return;
    }

    const success = waitForPopupMessage<{ type: string; context?: string }>("oauth:success", {
      predicate: message => message.context === "auth",
    });
    const failure = waitForPopupMessage<{ type: string; context?: string; message?: string }>("oauth:error", {
      predicate: message => message.context === "auth",
    }).then(payload => {
      throw new Error(payload.message ?? "Google sign-in was cancelled.");
    });

    Promise.race([success, failure])
      .then(() => {
        show({ title: "Signed in", description: "Welcome back!", variant: "success" });
        router.replace("/onboarding");
      })
      .catch(error => {
        show({ title: "Google sign-in failed", description: error.message, variant: "error" });
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <button
      type="button"
      onClick={handleGoogleLogin}
      disabled={pending}
      className="px-3 py-2 rounded border w-full disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}
