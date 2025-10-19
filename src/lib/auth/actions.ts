"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema, recoverySchema } from "./schemas";
import type { LoginInput, SignupInput, RecoveryInput } from "./schemas";

type ActionResult<T = void> = 
  | { success: true; data: T }
  | { success: false; error: string };

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  "Invalid login credentials": "Invalid email or password",
  "Email not confirmed": "Please verify your email address before logging in",
  "User already registered": "An account with this email already exists",
  "Password should be at least 6 characters": "Password does not meet security requirements",
};

function getSafeErrorMessage(error: Error | { message: string }): string {
  const message = error.message;
  
  if (SAFE_ERROR_MESSAGES[message]) {
    return SAFE_ERROR_MESSAGES[message];
  }
  
  if (message.toLowerCase().includes("network") || message.toLowerCase().includes("fetch")) {
    return "Network error. Please check your connection and try again";
  }
  
  console.error("[AUTH_ERROR] Unmapped error:", {
    message,
    timestamp: new Date().toISOString(),
  });
  
  return "An unexpected error occurred. Please try again";
}

export async function loginAction(input: LoginInput): Promise<ActionResult> {
  const validation = loginSchema.safeParse(input);
  
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.errors[0]?.message || "Invalid input",
    };
  }

  const supabase = await createSupabaseServerClient();
  
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: validation.data.email,
      password: validation.data.password,
    });

    if (error) {
      return {
        success: false,
        error: getSafeErrorMessage(error),
      };
    }

    revalidatePath("/", "layout");
    redirect("/dashboard");
  } catch (error) {
    if ((error as Error).message?.includes("NEXT_REDIRECT")) {
      throw error;
    }
    
    return {
      success: false,
      error: getSafeErrorMessage(error as Error),
    };
  }
}

export async function signupAction(input: SignupInput): Promise<ActionResult> {
  const validation = signupSchema.safeParse(input);
  
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.errors[0]?.message || "Invalid input",
    };
  }

  const supabase = await createSupabaseServerClient();
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email: validation.data.email,
      password: validation.data.password,
      options: {
        data: {
          name: validation.data.name,
          howDidYouHear: validation.data.howDidYouHear,
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });

    if (error) {
      return {
        success: false,
        error: getSafeErrorMessage(error),
      };
    }

    if (!data.user) {
      return {
        success: false,
        error: "Failed to create account. Please try again",
      };
    }

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: getSafeErrorMessage(error as Error),
    };
  }
}

export async function logoutAction(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        success: false,
        error: getSafeErrorMessage(error),
      };
    }

    revalidatePath("/", "layout");
    redirect("/login");
  } catch (error) {
    if ((error as Error).message?.includes("NEXT_REDIRECT")) {
      throw error;
    }
    
    return {
      success: false,
      error: getSafeErrorMessage(error as Error),
    };
  }
}

export async function recoveryAction(input: RecoveryInput): Promise<ActionResult> {
  const validation = recoverySchema.safeParse(input);
  
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.errors[0]?.message || "Invalid input",
    };
  }

  const supabase = await createSupabaseServerClient();
  
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      validation.data.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
      }
    );

    if (error) {
      return {
        success: false,
        error: getSafeErrorMessage(error),
      };
    }

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: getSafeErrorMessage(error as Error),
    };
  }
}

export async function signInWithGoogleAction(): Promise<ActionResult<{ url: string }>> {
  const supabase = await createSupabaseServerClient();
  
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });

    if (error) {
      return {
        success: false,
        error: getSafeErrorMessage(error),
      };
    }

    if (!data.url) {
      return {
        success: false,
        error: "Failed to initialize Google sign-in. Please try again",
      };
    }

    return {
      success: true,
      data: { url: data.url },
    };
  } catch (error) {
    return {
      success: false,
      error: getSafeErrorMessage(error as Error),
    };
  }
}

