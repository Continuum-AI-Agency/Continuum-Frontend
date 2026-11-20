'use client';

import { Loader2, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { FormAlert } from '@/components/auth/FormAlert';
import { FormInput } from '@/components/auth/FormInput';
import { Button } from '@/components/ui/button';
import { useValidationErrorMap } from '@/i18n/validation';
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
  const tUi = useTranslations('auth');
  const validationErrorMap = useValidationErrorMap();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CodeFormInput>({
    // Loaded on submit, like LoginForm's, to keep zod and the resolver off /login's first load.
    resolver: async (values, context, options) => {
      const [{ zodResolver }, { createAuthSchemas }] = await Promise.all([
        import('@hookform/resolvers/zod'),
        import('@/lib/auth/schemas'),
      ]);
      const { emailCodeSchema } = createAuthSchemas({
        invalidEmail: tUi('invalidEmail'),
        requiredPassword: tUi('requiredPassword'),
        emailCodeRequired: tUi('emailCodeRequired'),
      });
      return zodResolver(emailCodeSchema.pick({ token: true }), { error: validationErrorMap })(
        values,
        context,
        options,
      );
    },
    defaultValues: { token: '' },
  });

  return (
    <div className="flex flex-col items-center justify-center space-y-6 py-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
        <Mail className="h-10 w-10 text-emerald-500" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{tUi('m_fab9f40578')}</h2>
        <p className="max-w-md text-secondary">
          {tUi('m_2e4505c4aa')} <span className="font-semibold text-foreground">{email}</span>
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
          label={tUi('m_c5c946fabd')}
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
              {tUi('m_6ca8910ee6')}
            </span>
          ) : (
            tUi('m_2091920a6a')
          )}
        </Button>
      </form>

      {onResend && (
        <Button onClick={onResend} disabled={isPending} variant="ghost">
          {tUi('m_55ea7b3eba')}
        </Button>
      )}

      <p className="max-w-md text-sm text-secondary">{tUi('m_535d312732')}</p>
    </div>
  );
}
