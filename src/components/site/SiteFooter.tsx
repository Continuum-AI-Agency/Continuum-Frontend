'use client';

import Link from 'next/link';
import { Separator } from '@/components/ui/separator';

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-white/40 dark:border-white/10 bg-white/40 dark:bg-black/20 backdrop-blur-md">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-col gap-3 py-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Continuum AI
            </span>
            <div className="flex items-center gap-3">
              <Link href="/privacy" className="text-sm">
                Privacy
              </Link>
              <Separator orientation="vertical" className="h-8" />
              <Link href="/terms" className="text-sm">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
