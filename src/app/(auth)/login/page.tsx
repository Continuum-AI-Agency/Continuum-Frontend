"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@radix-ui/themes";
import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FormInput } from "@/components/auth/FormInput";
import { FormAlert } from "@/components/auth/FormAlert";
import { EmailSent } from "@/components/auth/EmailSent";
import { useAuth } from "@/hooks/useAuth";
import { magicLinkSchema, type MagicLinkInput } from "@/lib/auth/schemas";
import posthog from "posthog-js";
import { buildInviteCallbackPath } from "@/lib/invites/urls";
import styles from "./login.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: "Authentication failed. Please try again.",
  unexpected_error: "An unexpected error occurred. Please try again.",
};

function getSafeRedirectPath(path: string | null): string | undefined {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return undefined;
  }
  return path;
}

export default function LoginPage() {
  const {
    sendMagicLink,
    signInWithGooglePopup,
    isPending,
    isGooglePending,
    error,
    clearError,
    setError: setAuthError,
  } = useAuth();
  const searchParams = useSearchParams();
  const [emailSent, setEmailSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const inviteToken = searchParams.get("token");
  const inviteBrand = searchParams.get("brand");
  const inviteRedirect =
    inviteToken && inviteBrand
      ? buildInviteCallbackPath(inviteToken, inviteBrand)
      : undefined;
  const redirectTo = inviteRedirect ?? getSafeRedirectPath(searchParams.get("redirectTo"));

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MagicLinkInput>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam && ERROR_MESSAGES[errorParam]) {
      setAuthError(ERROR_MESSAGES[errorParam]);
    }
  }, [searchParams, setAuthError]);

  const onSubmit = async (data: MagicLinkInput) => {
    clearError();
    setSubmittedEmail(data.email);

    const success = await sendMagicLink({ email: data.email, redirectTo });
    if (success) {
      posthog.capture("user_logged_in", { method: "magic_link", email: data.email });
      setEmailSent(true);
    }
  };

  const handleResend = async () => {
    if (submittedEmail) {
      await sendMagicLink({ email: submittedEmail, redirectTo });
    }
  };

  return (
    <main className={`${styles.loginBackground} min-h-[100dvh] w-full max-w-full overflow-x-hidden`}>
      <div className={styles.wave} />
      <div className={`${styles.wave} ${styles.waveSecond}`} />
      <div className={`${styles.wave} ${styles.waveThird}`} />

      <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-4 py-8 text-primary sm:px-6 lg:px-8">
        <div className="w-full max-w-[28rem]">
          <div className="mb-5 flex justify-center sm:mb-7">
            <Image
              src="/logos/Continuum.png"
              alt="Continuum"
              width={180}
              height={48}
              priority
              className="h-10 w-auto drop-shadow-[0_10px_24px_rgba(15,23,42,0.18)] sm:h-12"
            />
          </div>

          {!emailSent ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <section className="glass-panel rounded-[1.75rem] border-subtle p-5 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.55)] sm:rounded-[2rem] sm:p-8">
                <div className="mb-5 sm:mb-8">
                  <h1 className="mb-1 text-balance text-2xl font-bold tracking-tight text-primary sm:mb-2 sm:text-3xl">
                    Welcome to Continuum
                  </h1>
                  <p className="text-pretty text-sm leading-6 text-secondary sm:text-base">
                    Enter your email and we&apos;ll send you a secure sign-in link.
                  </p>
                </div>

                {error && <FormAlert message={error} variant="error" />}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4 sm:space-y-5 sm:mt-6">
                  <FormInput
                    {...register("email")}
                    id="email"
                    type="email"
                    label="Email address"
                    placeholder="Enter your email"
                    error={errors.email?.message as string}
                    disabled={isPending}
                  />

                  <Button
                    type="submit"
                    size="3"
                    disabled={isPending}
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                    className="min-h-11 rounded-xl py-3 font-semibold shadow-[0_14px_28px_-14px_rgba(17,24,39,0.55)] transition-[filter,box-shadow,transform] duration-200 hover:brightness-110 hover:shadow-[0_18px_36px_-16px_rgba(17,24,39,0.65)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
                  >
                    {isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending link...
                      </span>
                    ) : "Send sign-in link"}
                  </Button>
                </form>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-subtle" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-surface px-4 text-sm text-secondary">
                      Or continue with
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => signInWithGooglePopup(redirectTo)}
                  disabled={isPending || isGooglePending}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 shadow-sm transition-[background-color,box-shadow,transform] duration-200 hover:bg-gray-50 hover:shadow active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGooglePending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="truncate">Connecting</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      <span>Google</span>
                    </>
                  )}
                </button>

                <div className="mt-5 sm:mt-8">
                  <p className="text-center text-xs text-secondary">
                    By continuing, you agree to our{" "}
                    <Link href="/terms" className="underline transition-opacity hover:opacity-80" style={{ color: "var(--primary)" }}>
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="underline transition-opacity hover:opacity-80" style={{ color: "var(--primary)" }}>
                      Privacy Policy
                    </Link>
                  </p>
                </div>
              </section>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="glass-panel rounded-[2rem] border-subtle p-8 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.55)]"
            >
              <EmailSent
                email={submittedEmail}
                onResend={handleResend}
                isResending={isPending}
              />
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}
