import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support | Continuum',
  description: 'Get help with Continuum and its ChatGPT plugin.',
};

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-default text-primary px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/" className="text-secondary underline">
          Continuum
        </Link>
        <h1 className="text-4xl font-bold">Support</h1>
        <p>
          For help with your account, connected services, or the Continuum ChatGPT plugin, email{' '}
          <a className="underline" href="mailto:product@trycontinuum.ai">
            product@trycontinuum.ai
          </a>
          .
        </p>
        <p className="text-secondary">
          Include the action you tried, the error message, and when it happened. Keep passwords,
          access tokens, and private customer data out of your email.
        </p>
        <h2 className="text-2xl font-semibold">Connecting Continuum</h2>
        <p>
          Sign in with your Continuum account and choose a brand you can access. If a connection has
          expired or been revoked, disconnect it in your assistant and connect again. Connected
          marketing services require their own authorization.
        </p>
        <nav aria-label="Policies" className="flex gap-6 text-secondary">
          <Link className="underline" href="/privacy">
            Privacy policy
          </Link>
          <Link className="underline" href="/terms">
            Terms of service
          </Link>
        </nav>
      </div>
    </main>
  );
}
