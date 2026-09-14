import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function Forbidden() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-6 text-6xl font-bold text-zinc-300 dark:text-zinc-700">403</div>
        <h1 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Access denied
        </h1>
        <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">
          You do not have permission to view this resource.
        </p>
        <Link href="/dashboard" className={buttonVariants({ size: 'lg' })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
