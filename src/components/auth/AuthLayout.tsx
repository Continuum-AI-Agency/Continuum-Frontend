import { GalaxyBackground } from '@/components/ui/GalaxyBackground';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen">
      <GalaxyBackground intensity={1} speed="glacial" />
      <div className="wave-background">
        <div className="wave-layer layer-1" />
        <div className="wave-layer layer-2" />
        <div className="wave-layer layer-3" />
      </div>
      <div className="mx-auto w-full relative z-10 py-12 px-4 sm:py-20">
        <div className="flex flex-col items-center gap-8">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h1 className="text-4xl text-gray-900 dark:text-gray-50 mb-4 font-bold tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-gray-600 dark:text-gray-400 text-base leading-relaxed mt-2">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="rounded-2xl bg-white/95 dark:bg-gray-800/95 p-8 shadow-2xl border border-gray-200 dark:border-gray-700 backdrop-blur-md">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
