"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@radix-ui/themes";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { FormInput } from "@/components/auth/FormInput";
import { FormTextarea } from "@/components/auth/FormTextarea";
import { FormAlert } from "@/components/auth/FormAlert";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { useAuth } from "@/hooks/useAuth";
import { signupSchema, type SignupInput } from "@/lib/auth/schemas";

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
      <AuthLayout
        title="Check your email"
        subtitle="We sent you a verification link"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-6"
        >
          <FormAlert
            message="Account created successfully! Please check your email to verify your account."
            variant="success"
          />
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Redirecting to login...
          </p>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start managing your campaigns with Continuum"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {error && <FormAlert message={error} variant="error" />}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
            label="How did you hear about Parsed?"
            placeholder="e.g., Social media, friend recommendation, online search..."
            error={errors.howDidYouHear?.message}
            disabled={isPending}
            rows={3}
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
                Creating account...
              </span>
            ) : "Create Account"}
          </Button>
        </form>

        <p className="text-center mt-8 text-sm text-gray-600 dark:text-gray-400">
          Already have an account?{" "}
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

