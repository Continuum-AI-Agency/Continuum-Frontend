'use client';
import { useTranslations } from 'next-intl';
import { Separator } from '@/components/ui/separator';
import { Link } from '@/i18n/navigation';

export function SiteFooter() {
  const uiText = useTranslations('public');
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
                {uiText('privacy_54a57c3')}
              </Link>
              <Separator orientation="vertical" className="h-8" />
              <Link href="/terms" className="text-sm">
                {uiText('terms_ede5489')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
