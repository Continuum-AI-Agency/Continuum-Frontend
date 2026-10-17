'use client';

import { Loader2, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { FormAlert } from '@/components/auth/FormAlert';
import { FormInput } from '@/components/auth/FormInput';
import { Button } from '@/components/ui/button';
import type { EmailCodeInput } from '@/lib/auth/schemas';

type CodeFormInput = Pick<EmailCodeInput, 'token'>;

interface EmailSentProps {
  email: string;
  onVerifyCode: (code: string) => void;
  onResend?: () => void;
  isPending?: boolean;
  error?: string | null;
}

export function EmailSent({ email, onVerifyCode, onResend, isPending, error }: EmailSentProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CodeFormInput>({
    // Loaded on submit, like LoginForm's, to keep zod and the resolver off /login's first load.
    resolver: async (values, context, options) => {
      const [{ zodResolver }, { emailCodeSchema }] = await Promise.all([
        import('@hookform/resolvers/zod'),
        import('@/lib/auth/schemas'),
      ]);
      return zodResolver(emailCodeSchema.pick({ token: true }))(values, context, options);
    },
    defaultValues: { token: '' },
  });

  return (
    <div className="flex flex-col items-center justify-center space-y-6 py-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
        <Mail className="h-10 w-10 text-emerald-500" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Check your email</h2>
        <p className="max-w-md text-secondary">
          We sent a sign-in link and code to{' '}
          <span className="font-semibold text-foreground">{email}</span>
        </p>
      </div>

      {error && (
        <div className="w-full text-left">
          <FormAlert message={error} variant="error" />
        </div>
      )}

      <form
        onSubmit={handleSubmit(({ token }) => onVerifyCode(token))}
        className="w-full space-y-4 text-left"
      >
        <FormInput
          {...register('token')}
          id="email-code"
          label="Code from the email"
          placeholder="123456"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={12}
          error={errors.token?.message}
          disabled={isPending}
        />
        <Button
          type="submit"
          size="lg"
          variant="cta"
          disabled={isPending}
          className="w-full min-h-11 rounded-xl py-3 font-semibold"
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in...
            </span>
          ) : (
            'Sign in with code'
          )}
        </Button>
      </form>

      {onResend && (
        <Button onClick={onResend} disabled={isPending} variant="ghost">
          Resend email
        </Button>
      )}

      <p className="max-w-md text-sm text-secondary">
        Open the link on any device, or type the code here to sign in on this one. Both expire in 1
        hour, and sending a new email replaces them.
      </p>
    </div>
  );
}
