"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@radix-ui/themes";
import Link from "next/link";
import { motion } from "framer-motion";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { FormInput } from "@/components/auth/FormInput";
import { FormAlert } from "@/components/auth/FormAlert";
import { useAuth } from "@/hooks/useAuth";
import { recoverySchema, type RecoveryInput } from "@/lib/auth/schemas";

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

  if (success) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="We sent you a password reset link"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-6"
        >
          <FormAlert
            message="If an account exists with that email, you will receive a password reset link shortly."
            variant="success"
          />
          <p className="text-center mt-6 text-sm text-gray-600 dark:text-gray-400">
            Remember your password?{" "}
            <Link
              href="/login"
              className="font-semibold text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Password Recovery"
      subtitle="Enter your email address and we'll send you instructions to reset your password"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {error && <FormAlert message={error} variant="error" />}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
            style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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

        <p className="text-center mt-8 text-sm text-gray-600 dark:text-gray-400">
          Remember your password?{" "}
          <Link
            href="/login"
            className="font-semibold text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </motion.div>
    </AuthLayout>
  );
}

