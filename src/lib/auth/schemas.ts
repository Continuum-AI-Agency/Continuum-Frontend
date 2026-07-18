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
