import { z } from 'zod';

export const magicLinkSchema = z.object({
  email: z.string().email('Invalid email address'),
  redirectTo: z.string().min(1).optional(),
});

export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

// Password sign-in exists for accounts that cannot use an inbox round-trip or a
// third-party IdP — platform reviewers auditing the app against static
// credentials. Magic link remains the path offered to users.
export const passwordSignInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  redirectTo: z.string().min(1).optional(),
});

export type PasswordSignInInput = z.infer<typeof passwordSignInSchema>;

// The login form renders one field set and swaps validation by mode, so both
// modes must agree on the value shape. This is the magic-link mode's validation:
// the password field is present but carries no requirement until the user
// switches to password sign-in.
export const magicLinkFormSchema = magicLinkSchema.extend({
  password: z.string(),
});

// The magic-link email also carries its one-time code. Typing it signs in on the
// device the user is onboarding on, whichever device opened the email, and it
// survives a link that a mail-app preview or a second open already spent.
// Supabase issues 6 digits by default and up to 10 when configured.
export const emailCodeSchema = z.object({
  email: z.string().email('Invalid email address'),
  token: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/, 'Enter the code from your email'),
  redirectTo: z.string().min(1).optional(),
});

export type EmailCodeInput = z.infer<typeof emailCodeSchema>;
