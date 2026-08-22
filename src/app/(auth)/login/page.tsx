import Image from 'next/image';
import { buildInviteCallbackPath } from '@/lib/invites/urls';
import { LoginForm } from './LoginForm';
import styles from './login.module.css';

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

const ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: 'Authentication failed. Please try again.',
  unexpected_error: 'An unexpected error occurred. Please try again.',
};

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

function resolveInitialError(params: LoginPageSearchParams): string | undefined {
  const errorParam = firstParam(params.error);
  return errorParam ? ERROR_MESSAGES[errorParam] : undefined;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};

  return (
    <main
      className={`${styles.loginBackground} min-h-[100dvh] w-full max-w-full overflow-x-hidden`}
    >
      <div className={styles.wave} />
      <div className={`${styles.wave} ${styles.waveSecond}`} />
      <div className={`${styles.wave} ${styles.waveThird}`} />

      <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-4 py-8 text-primary sm:px-6 lg:px-8">
        <div className="w-full max-w-[28rem]">
          <div className="mb-5 flex justify-center sm:mb-7">
            <Image
              src="/logos/Continuum.png"
              alt="Continuum"
              width={180}
              height={48}
              priority
              className="h-10 w-auto drop-shadow-[0_10px_24px_rgba(15,23,42,0.18)] sm:h-12"
            />
          </div>

          <LoginForm
            initialError={resolveInitialError(params)}
            redirectTo={resolveRedirectTo(params)}
          />
        </div>
      </div>
    </main>
  );
}
