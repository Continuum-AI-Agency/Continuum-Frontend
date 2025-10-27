"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Flex } from "@radix-ui/themes";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { FormInput } from "@/components/auth/FormInput";
import { FormAlert } from "@/components/auth/FormAlert";
import { useAuth } from "@/hooks/useAuth";
import { loginSchema, type LoginInput } from "@/lib/auth/schemas";

const ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: "Authentication failed. Please try again.",
  unexpected_error: "An unexpected error occurred. Please try again.",
};

export default function LoginPage() {
  const { login, signInWithGooglePopup, isPending, isGooglePending, error, clearError, setError } = useAuth();
  const searchParams = useSearchParams();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam && ERROR_MESSAGES[errorParam]) {
      setError(ERROR_MESSAGES[errorParam]);
    }
  }, [searchParams, setError]);

  const onSubmit = async (data: LoginInput) => {
    clearError();
    await login(data);
  };

  return (
    <AuthLayout
      title="Sign in to your account"
      subtitle="Welcome back to Continuum"
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

          <FormInput
            {...register("password")}
            id="password"
            type="password"
            label="Password"
            placeholder="Enter your password"
            error={errors.password?.message}
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
                Signing in...
              </span>
            ) : "Sign in"}
          </Button>
        </form>

        <Flex justify="end" align="center" className="mt-3">
          <Link
            href="/recovery"
            className="text-sm font-semibold text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
          >
            Forgot your password?
          </Link>
        </Flex>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-600" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white dark:bg-gray-800 px-4 text-sm text-gray-500 dark:text-gray-400">
              Or continue with
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={signInWithGooglePopup}
          disabled={isPending || isGooglePending}
          className="w-full flex items-center justify-center border-2 border-purple-600 dark:border-purple-400 bg-transparent hover:bg-purple-50 dark:hover:bg-purple-900/20 text-white dark:text-white font-semibold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
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
          {isGooglePending ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Connecting to Google...
            </span>
          ) : (
            "Sign in with Google"
          )}
        </button>

        <p className="text-center mt-8 text-sm text-gray-600 dark:text-gray-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-semibold text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
          >
            Create an account
          </Link>
        </p>
      </motion.div>
    </AuthLayout>
  );
}

