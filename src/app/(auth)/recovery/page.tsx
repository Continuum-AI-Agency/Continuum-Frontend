"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@radix-ui/themes";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { FormInput } from "@/components/auth/FormInput";
import { FormAlert } from "@/components/auth/FormAlert";
import { FeatureList } from "@/components/auth/FeatureList";
import { useAuth } from "@/hooks/useAuth";
import { recoverySchema, type RecoveryInput } from "@/lib/auth/schemas";

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

export default function RecoveryPage() {
  const { recovery, isPending, error, clearError } = useAuth();
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RecoveryInput>({
    resolver: zodResolver(recoverySchema),
  });

  const onSubmit = async (data: RecoveryInput) => {
    clearError();
    setSuccess(false);
    
    const result = await recovery(data);
    
    if (result) {
      setSuccess(true);
    }
  };

  const glowGradient = `radial-gradient(circle at 60% 20%, rgba(130, 102, 255, 0.45), transparent 55%),
    radial-gradient(circle at 30% 80%, rgba(99, 253, 207, 0.35), transparent 60%)`;

  if (success) {
    return (
      <div className="min-h-screen flex overflow-hidden bg-slate-950" style={{ backgroundImage: glowGradient }}>
        {/* Left Column */}
        <div className="w-full lg:w-1/2 flex flex-col">
          {/* Header */}
          <div className="p-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-medium">Back to home</span>
            </Link>
          </div>

          {/* Success Container */}
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

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-950/70 backdrop-blur-xl rounded-3xl border border-white/30 dark:border-white/10 p-8 shadow-2xl text-center"
              >
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
                <p className="text-gray-400 mb-6">
                  We sent you a password reset link. Please check your email to reset your password.
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  If an account exists with that email, you will receive a password reset link shortly.
                </p>
                <Link
                  href="/login"
                  className="inline-block text-sm font-semibold text-white hover:text-gray-200 transition-colors"
                >
                  Back to sign in
                </Link>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Right Column - Features */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
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

  return (
    <div className="min-h-screen flex overflow-hidden bg-slate-950" style={{ backgroundImage: glowGradient }}>
      {/* Left Column - Recovery Form */}
      <div className="w-full lg:w-1/2 flex flex-col">
        {/* Header */}
        <div className="p-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Back to home</span>
          </Link>
        </div>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center pl-12 pr-8 pt-4 pb-16 overflow-y-auto">
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

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Card */}
              <div className="bg-slate-950/70 backdrop-blur-xl rounded-3xl border border-white/30 dark:border-white/10 p-8 shadow-2xl">
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-white mb-2">
                    Password Recovery
                  </h1>
                  <p className="text-gray-400">
                    Enter your email address and we'll send you instructions to reset your password
                  </p>
                </div>

                {error && <FormAlert message={error} variant="error" />}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-6">
                  <FormInput
                    {...register("email")}
                    id="email"
                    type="email"
                    label="Email"
                    placeholder="you@company.com"
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
                      backgroundColor: '#2563EB',
                    }}
                    className="text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                  >
                    {isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Sending recovery email...
                      </span>
                    ) : "Send Recovery Email"}
                  </Button>
                </form>

                {/* Sign in link */}
                <p className="text-center mt-8 text-sm text-gray-400">
                  Remember your password?{" "}
                  <Link
                    href="/login"
                    className="font-semibold text-white hover:text-gray-200 transition-colors"
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Right Column - Features */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
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
