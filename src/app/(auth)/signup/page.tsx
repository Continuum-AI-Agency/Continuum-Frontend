"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@radix-ui/themes";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FormInput } from "@/components/auth/FormInput";
import { FormTextarea } from "@/components/auth/FormTextarea";
import { FormAlert } from "@/components/auth/FormAlert";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { FeatureList } from "@/components/auth/FeatureList";
import { useAuth } from "@/hooks/useAuth";
import { signupSchema, type SignupInput } from "@/lib/auth/schemas";
import { LOGIN_GLOW_GRADIENT } from "@/lib/ui/backgrounds";

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

export default function SignupPage() {
  const { signup, isPending, error, clearError } = useAuth();
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
  });

  const password = watch("password", "");

  const onSubmit = async (data: SignupInput) => {
    clearError();
    setSuccess(false);

    const result = await signup(data);

    if (result) {
      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex overflow-hidden bg-default text-primary" style={{ backgroundImage: LOGIN_GLOW_GRADIENT }}>
        {/* Left Column */}
        <div className="w-full lg:w-1/2 flex flex-col">
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

          {/* Success Container */}
          <div className="flex-1 flex items-start justify-center pl-12 pr-8 py-16">
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
                className="glass-panel rounded-3xl p-8 shadow-2xl border-subtle text-center"
              >
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-primary mb-2">Check your email</h2>
                <p className="text-secondary mb-6">
                  We sent you a verification link. Please check your email to verify your account.
                </p>
                <p className="text-sm text-secondary flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Redirecting to login...
                </p>
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
    <div className="min-h-screen flex overflow-hidden bg-default text-primary" style={{ backgroundImage: LOGIN_GLOW_GRADIENT }}>
      {/* Left Column - Signup Form */}
      <div className="w-full lg:w-1/2 flex flex-col">
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
        <div className="flex-1 flex items-center justify-center pl-12 pr-8 py-16 overflow-y-auto">
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
              <div className="glass-panel rounded-3xl p-8 shadow-2xl border-subtle">
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-primary mb-2">
                    Create your account
                  </h1>
                  <p className="text-secondary">
                    Start managing your campaigns with Continuum
                  </p>
                </div>

                {error && <FormAlert message={error} variant="error" />}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-6">
                  <FormInput
                    {...register("name")}
                    id="name"
                    type="text"
                    label="Full Name"
                    placeholder="John Doe"
                    error={errors.name?.message}
                    disabled={isPending}
                  />

                  <FormInput
                    {...register("email")}
                    id="email"
                    type="email"
                    label="Email"
                    placeholder="john.doe@example.com"
                    error={errors.email?.message}
                    disabled={isPending}
                  />

                  <div>
                    <FormInput
                      {...register("password")}
                      id="password"
                      type="password"
                      label="Password"
                      placeholder="Enter your password"
                      error={errors.password?.message}
                      disabled={isPending}
                    />
                    {password && <PasswordRequirements password={password} />}
                  </div>

                  <FormInput
                    {...register("confirmPassword")}
                    id="confirmPassword"
                    type="password"
                    label="Confirm Password"
                    placeholder="Confirm your password"
                    error={errors.confirmPassword?.message}
                    disabled={isPending}
                  />

                  <FormTextarea
                    {...register("howDidYouHear")}
                    id="howDidYouHear"
                    label="How did you hear about Continuum? (Optional)"
                    placeholder="e.g., Social media, friend recommendation, online search..."
                    error={errors.howDidYouHear?.message}
                    disabled={isPending}
                    rows={3}
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
                        Creating account...
                      </span>
                    ) : "Create Account"}
                  </Button>
                </form>

                {/* Terms */}
                <p className="text-center mt-6 text-xs text-secondary">
                  By creating an account, you agree to our{" "}
                  <Link href="/terms" className="underline transition-opacity hover:opacity-80 text-brand-primary">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="underline transition-opacity hover:opacity-80 text-brand-primary">
                    Privacy Policy
                  </Link>
                </p>
              </div>

              {/* Sign in link */}
              <p className="text-center mt-8 text-sm text-secondary">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-primary hover:opacity-80 transition-colors"
                >
                  Sign in
                </Link>
              </p>
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
          variant="light"
        />
      </div>
    </div>
  );
}
