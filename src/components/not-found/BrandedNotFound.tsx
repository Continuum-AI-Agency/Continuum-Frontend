import { Home } from 'lucide-react';
import Link from 'next/link';
import { BackButton } from './BackButton';

export function BrandedNotFound() {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#101111] px-6 py-16 text-zinc-100">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:48px_48px]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(124,111,255,0.18),transparent_34%),radial-gradient(circle_at_50%_68%,rgba(14,165,233,0.10),transparent_32%),linear-gradient(to_bottom,rgba(16,17,17,0.10),#101111_78%)]"
      />

      <section className="flex w-full max-w-3xl flex-col items-center text-center">
        <div className="mb-16 inline-flex items-center gap-3 text-sm font-semibold text-zinc-300">
          <span className="size-2 rounded-full bg-[#7c6fff] shadow-[0_0_20px_rgba(124,111,255,0.9)]" />
          <span>Continuum AI</span>
        </div>

        <p className="mb-8 font-mono text-xs uppercase text-zinc-400">Status / 404</p>

        <h1
          className="select-none bg-[linear-gradient(180deg,#f7f7f7_0%,#cfcfcf_28%,#7a7a7a_62%,#2f3030_100%)] bg-clip-text text-8xl font-black leading-none text-transparent drop-shadow-[0_24px_24px_rgba(0,0,0,0.5)] sm:text-[10rem] lg:text-[13rem]"
          aria-label="404"
        >
          404
        </h1>

        <div className="mt-10 max-w-sm">
          <h2
            className="text-3xl font-semibold"
            style={{
              color: '#f8fafc',
              textShadow: '0 2px 18px rgba(0,0,0,0.72)',
            }}
          >
            We can&apos;t find that page.
          </h2>
          <p className="mt-4 font-mono text-sm leading-6 text-zinc-400">
            The link may be old, or the page may have moved. Check the URL or head back to somewhere
            you know.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <BackButton />
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-zinc-100 px-3 text-sm font-medium text-zinc-950 transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-[#7c6fff]"
          >
            <Home aria-hidden="true" className="size-4" />
            Take me home
          </Link>
        </div>
      </section>
    </main>
  );
}
