"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@radix-ui/themes";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FormInput } from "@/components/auth/FormInput";
import { FormAlert } from "@/components/auth/FormAlert";
import { FeatureList } from "@/components/auth/FeatureList";
import { EmailSent } from "@/components/auth/EmailSent";
import { useAuth } from "@/hooks/useAuth";
import { magicLinkSchema, type MagicLinkInput } from "@/lib/auth/schemas";

const ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: "Authentication failed. Please try again.",
  unexpected_error: "An unexpected error occurred. Please try again.",
};

const FEATURES = [
  {
    title: "Real-time brand guardrails",
    description: "Every creative automatically honors your brand guidelines",
  },
  {
    title: "Cross-platform orchestration",
    description: "Coordinate campaigns across all your social channels",
  },
  {
    title: "Performance optimization",
    description: "AI-driven insights to maximize engagement and ROI",
  },
];

export default function LoginPage() {
  const { sendMagicLink, signInWithGoogle, signInWithLinkedIn, signInWithGooglePopup, isPending, isGooglePending, error, clearError, setError } = useAuth();
  const searchParams = useSearchParams();
  const [emailSent, setEmailSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MagicLinkInput>({
    resolver: zodResolver(magicLinkSchema),
  });

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam && ERROR_MESSAGES[errorParam]) {
      setError(ERROR_MESSAGES[errorParam]);
    }
  }, [searchParams, setError]);

  const onSubmit = async (data: MagicLinkInput) => {
    clearError();
    const success = await sendMagicLink(data);
    if (success) {
      setSubmittedEmail(data.email);
      setEmailSent(true);
    }
  };

  const handleResend = async () => {
    if (submittedEmail) {
      await sendMagicLink({ email: submittedEmail });
    }
  };

  const glowGradient = `radial-gradient(circle at 60% 20%, rgba(130, 102, 255, 0.45), transparent 55%),
    radial-gradient(circle at 30% 80%, rgba(99, 253, 207, 0.35), transparent 60%)`;

  return (
    <div className="min-h-screen flex overflow-hidden bg-default text-primary" style={{ backgroundImage: glowGradient }}>
      {/* Left Column - Login Form */}
      <div 
        className="w-full lg:w-1/2 flex flex-col" 
      >
        {/* Header */}
        <div className="p-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-secondary hover:text-primary transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Back to home</span>
          </Link>
        </div>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center pl-12 pr-8 py-16">
          <div className="w-full max-w-md">
            {/* Logo */}
            <div className="mb-8">
              <Image
                src="/logos/Continuum.png"
                alt="Continuum"
                width={180}
                height={48}
                priority
                className="h-12 w-auto"
              />
            </div>
            {!emailSent ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Card */}
                <div className="glass-panel rounded-3xl p-8 shadow-2xl border-subtle">
                  <div className="mb-8">
                    <h1 className="text-3xl font-bold text-primary mb-2">
                      Welcome back
                    </h1>
                    <p className="text-secondary">
                      Sign in to continue building smarter, on-brand campaigns.
                    </p>
                  </div>

                  {error && <FormAlert message={error} variant="error" />}

                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-6">
                    <FormInput
                      {...register("email")}
                      id="email"
                      type="email"
                      label="Email address"
                      placeholder="Enter your email"
                      error={errors.email?.message}
                      disabled={isPending}
                    />

                    <Button
                      type="submit"
                      size="3"
                      disabled={isPending}
                      style={{ 
                        width: '100%', 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center',
                        backgroundColor: 'var(--primary)',
                        color: 'var(--primary-foreground)',
                      }}
                      className="font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                    >
                      {isPending ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Sending...
                        </span>
                      ) : "Continue with email"}
                    </Button>
                  </form>

                  {/* Divider */}
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

                  {/* OAuth Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={signInWithGooglePopup}
                      disabled={isPending || isGooglePending}
                      className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-xl border border-gray-300 shadow-sm hover:shadow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGooglePending ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span className="hidden sm:inline">Connecting...</span>
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
                          <span className="hidden sm:inline">Google</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={signInWithLinkedIn}
                      disabled={isPending}
                      className="flex items-center justify-center gap-2 bg-[#0A66C2] hover:bg-[#004182] font-medium py-3 px-4 rounded-xl shadow-sm hover:shadow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ color: '#fff' }}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                      <span className="hidden sm:inline">LinkedIn</span>
                    </button>
                  </div>

                  {/* Terms */}
                  <p className="text-center mt-6 text-xs text-secondary">
                    By continuing, you agree to our{" "}
                    <Link href="/terms" className="underline transition-opacity hover:opacity-80" style={{ color: "var(--accent)" }}>
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="underline transition-opacity hover:opacity-80" style={{ color: "var(--accent)" }}>
                      Privacy Policy
                    </Link>
                  </p>
                </div>

                {/* Trouble signing in */}
                <p className="text-center mt-8 text-sm text-secondary">
                  Having trouble signing in?
                </p>

                {/* Sign up link */}
                <p className="text-center mt-6 text-sm text-secondary">
                  Don&apos;t have an account?{" "}
                  <Link
                    href="/signup"
                    className="font-semibold text-primary hover:opacity-80 transition-colors"
                  >
                    Create an account
                  </Link>
                </p>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="glass-panel rounded-3xl p-8 shadow-2xl border-subtle"
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
      </div>

      {/* Right Column - Features */}
      <div 
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden"
      >
        {/* Decorative gradient orbs */}
        <div className="absolute top-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />

        <FeatureList
          title="Enterprise-grade brand protection"
          subtitle="Join teams that have increased campaign efficiency by 3.2x while maintaining 99.7% brand compliance."
          features={FEATURES}
          securityBadge="Enterprise security certified • SOC 2 Type II compliant"
        />
      </div>
    </div>
  );
}
