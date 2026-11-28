import { getTranslations } from 'next-intl/server';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';
import { ContinuumWordmark } from '@/components/shared/ContinuumWordmark';
import { buildInviteCallbackPath } from '@/lib/invites/urls';
import styles from '@/lib/ui/nightSky.module.css';
import { LoginForm } from './LoginForm';
import { LoginStarfield } from './LoginStarfield';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type LoginPageSearchParams = {
  token?: string | string[];
  brand?: string | string[];
  redirectTo?: string | string[];
  error?: string | string[];
};

type LoginPageProps = {
  searchParams?: Promise<LoginPageSearchParams>;
};

const ERROR_MESSAGES = {
  auth_callback_failed: 'callbackFailed',
  link_used: 'linkUsed',
  unexpected_error: 'unexpectedError',
} as const;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getSafeRedirectPath(path: string | undefined): string | undefined {
  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return undefined;
  }
  return path;
}

function resolveRedirectTo(params: LoginPageSearchParams): string | undefined {
  const inviteToken = firstParam(params.token);
  const inviteBrand = firstParam(params.brand);

  if (inviteToken && inviteBrand) {
    return buildInviteCallbackPath(inviteToken, inviteBrand);
  }

  return getSafeRedirectPath(firstParam(params.redirectTo));
}

function resolveInitialError(
  params: LoginPageSearchParams,
  t: (key: (typeof ERROR_MESSAGES)[keyof typeof ERROR_MESSAGES]) => string,
): string | undefined {
  const errorParam = firstParam(params.error);
  return errorParam && Object.hasOwn(ERROR_MESSAGES, errorParam)
    ? t(ERROR_MESSAGES[errorParam as keyof typeof ERROR_MESSAGES])
    : undefined;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const t = await getTranslations('auth');
  const params = searchParams ? await searchParams : {};

  return (
    <main className={`${styles.sky} min-h-[100dvh] w-full max-w-full overflow-x-hidden`}>
      <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-4 py-8 text-foreground sm:px-6 lg:px-8">
        <LoginStarfield className="w-full max-w-[28rem]">
          <div className="mb-5 flex justify-center sm:mb-7">
            <ContinuumWordmark onDark className="h-10 w-auto sm:h-12" />
          </div>

          <div className="mb-4 flex justify-end">
            <LanguageSelector scope="browser" />
          </div>
          <LoginForm
            initialError={resolveInitialError(params, t)}
            redirectTo={resolveRedirectTo(params)}
          />
        </LoginStarfield>
      </div>
    </main>
  );
}
