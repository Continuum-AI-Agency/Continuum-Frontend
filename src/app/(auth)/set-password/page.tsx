"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@radix-ui/themes";
import Image from "next/image";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { FormInput } from "@/components/auth/FormInput";
import { FormAlert } from "@/components/auth/FormAlert";
import { FeatureList } from "@/components/auth/FeatureList";
import { setPasswordSchema, type SetPasswordInput } from "@/lib/auth/schemas";
import { setPasswordAction } from "@/lib/auth/actions";
import styles from "../login/login.module.css";

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

export default function SetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
  });

  const onSubmit = async (data: SetPasswordInput) => {
    setError(null);
    setIsPending(true);

    try {
      const result = await setPasswordAction(data.password);

      if (result.success) {
        router.push("/dashboard");
      } else {
        setError(result.error || "Failed to set password");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={`${styles.loginBackground} min-h-screen overflow-hidden`}>
      <div className={styles.wave} />
      <div className={`${styles.wave} ${styles.waveSecond}`} />
      <div className={`${styles.wave} ${styles.waveThird}`} />

      <div className="relative z-10 min-h-screen flex text-primary">
        <div className="w-full lg:w-1/2 flex flex-col">
          <div className="p-6" />

          <div className="flex-1 flex items-center justify-center pl-12 pr-8 py-16">
            <div className="w-full max-w-md">
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
                <div className="glass-panel rounded-3xl p-8 shadow-2xl border-subtle">
                  <div className="mb-8">
                    <h1 className="text-3xl font-bold text-primary mb-2">
                      Set your password
                    </h1>
                    <p className="text-secondary">
                      Create a secure password to access your account.
                    </p>
                  </div>

                  {error && <FormAlert message={error} variant="error" />}

                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-6">
                    <FormInput
                      {...register("password")}
                      id="password"
                      type="password"
                      label="New Password"
                      placeholder="Enter your new password"
                      error={errors.password?.message}
                      disabled={isPending}
                    />

                    <FormInput
                      {...register("confirmPassword")}
                      id="confirmPassword"
                      type="password"
                      label="Confirm Password"
                      placeholder="Confirm your new password"
                      error={errors.confirmPassword?.message}
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
                          Setting password...
                        </span>
                      ) : "Set Password"}
                    </Button>
                  </form>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex lg:w-1/2 flex-col relative overflow-hidden">
          <div className="absolute top-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-20 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />

          <div className="p-6" />

          <div className="flex-1 flex items-center justify-center px-12 py-16">
            <div className="w-full max-w-xl relative mt-30">
              <FeatureList
                title="Enterprise-grade brand protection"
                subtitle="Join teams that have increased campaign efficiency by 3.2x while maintaining 99.7% brand compliance."
                features={FEATURES}
                securityBadge="Enterprise security certified • SOC 2 Type II compliant"
                variant="light"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
