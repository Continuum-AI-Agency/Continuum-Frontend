import { z } from 'zod';

type AuthValidationMessages = {
  invalidEmail: string;
  requiredPassword: string;
  emailCodeRequired: string;
};

export function createAuthSchemas(messages: AuthValidationMessages) {
  const magicLinkSchema = z.object({
    email: z.string().email(messages.invalidEmail),
    redirectTo: z.string().min(1).optional(),
  });
  const passwordSignInSchema = magicLinkSchema.extend({
    password: z.string().min(1, messages.requiredPassword),
  });
  // Both modes use one form shape; magic-link sign-in has no password requirement.
  const magicLinkFormSchema = magicLinkSchema.extend({ password: z.string() });
  const emailCodeSchema = magicLinkSchema.extend({
    // Supabase codes contain 6 to 10 digits, depending on the project configuration.
    token: z
      .string()
      .trim()
      .regex(/^\d{6,10}$/, messages.emailCodeRequired),
  });
  return {
    magicLinkSchema,
    passwordSignInSchema,
    magicLinkFormSchema,
    emailCodeSchema,
  };
}

// Server validation uses stable source messages, translated at the action boundary.
export const { magicLinkSchema, passwordSignInSchema, magicLinkFormSchema, emailCodeSchema } =
  createAuthSchemas({
    invalidEmail: 'Invalid email address',
    requiredPassword: 'Password is required',
    emailCodeRequired: 'Enter the code from your email',
  });

export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
export type PasswordSignInInput = z.infer<typeof passwordSignInSchema>;
export type EmailCodeInput = z.infer<typeof emailCodeSchema>;
