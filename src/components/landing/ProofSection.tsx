import Link from 'next/link';
import { Pill } from '@/components/kibo-ui/pill';

const testimonials = [
  {
    name: 'Placeholder CMO',
    role: 'Scaling DTC brand',
    quote:
      'Continuum gave us one source of truth for organic and paid within a week. The alerts alone saved our launch budget.',
  },
  {
    name: 'Placeholder Agency Partner',
    role: 'Performance marketing lead',
    quote:
      'Our creative approvals dropped from days to hours because clients can react directly inside the Continuum workspace.',
  },
];

export function ProofSection() {
  return (
    <div className="relative bg-white/60 dark:bg-slate-900/40">
      <div className="mx-auto w-full max-w-4xl py-20">
        <div className="flex flex-col gap-12">
          <div>
            <Pill className="rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              Social + investor proof
            </Pill>
            <h2 className="mt-3 text-2xl font-bold">Trusted by ambitious marketing teams</h2>
            <span className="mt-2 max-w-3xl text-base text-muted-foreground">
              Swap these placeholders with customer logos, quotes, and your latest funding
              announcement to mirror YC-grade credibility.
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="flex h-20 items-center justify-center border border-dashed border-slate-300/80 bg-white/80 text-sm font-medium uppercase tracking-wide text-slate-500 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-300"
              >
                Logo placeholder
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {testimonials.map((item) => (
              <div
                key={item.name}
                className="h-full border border-white/40 bg-white p-6 shadow-md dark:border-white/10 dark:bg-slate-900/70"
              >
                <span className="text-slate-700 dark:text-slate-100 text-base">
                  &ldquo;{item.quote}&rdquo;
                </span>
                <span className="mt-4 font-medium text-slate-500 dark:text-slate-300 text-sm">
                  {item.name}
                </span>
                <span className="text-slate-400 dark:text-slate-400 text-sm">{item.role}</span>
              </div>
            ))}
          </div>

          <div className="border border-purple-300/60 bg-purple-100/40 p-6 text-sm shadow-md backdrop-blur dark:border-purple-500/40 dark:bg-purple-500/15">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <span className="uppercase tracking-wide text-purple-700 dark:text-purple-200 text-sm">
                  Investor highlight placeholder
                </span>
                <h3 className="mt-1 text-purple-800 dark:text-purple-200 text-lg font-bold">
                  Announce your latest raise the moment it lands
                </h3>
                <span className="mt-2 max-w-xl text-purple-900/80 dark:text-purple-100/80 text-sm">
                  Drop in your press link and investor roster here. Pair it with a top-of-site
                  banner for FOMO just like YC teams do.
                </span>
              </div>
              <Link
                href="#investor-news"
                className="text-sm font-semibold text-purple-700 underline dark:text-purple-200"
              >
                Add announcement link -&gt;
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProofSection;
