import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function CommunitySection() {
  return (
    <div id="book-demo" className="relative bg-white/60 dark:bg-slate-900/40">
      <div className="mx-auto w-full max-w-4xl py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="border border-white/40 bg-white p-8 shadow-lg dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex flex-col gap-4">
              <h3 className="text-xl font-bold">Book an interactive walkthrough</h3>
              <span className="text-base text-muted-foreground">
                Pick a slot, share goals, and get instant access to our interactive dashboard demo.
                We sense-check each request with three quick questions so we can tailor the session.
              </span>
              <div className="flex flex-col gap-3">
                <Input placeholder="Work email" inputSize="lg" />
                <Input placeholder="Company" inputSize="lg" />
                <Textarea
                  placeholder="What are you trying to launch next?"
                  className="min-h-[96px]"
                />
              </div>
              <Button size="lg" data-intent="schedule-demo">
                Request live session
              </Button>
              <span className="text-slate-500 dark:text-slate-300 text-sm">
                We reply within one business day. Self-serve scheduling coming soon.
              </span>
            </div>
          </div>

          <div className="border border-purple-300/50 bg-purple-100/40 p-8 shadow-sm backdrop-blur dark:border-purple-500/40 dark:bg-purple-500/15">
            <div className="flex flex-col gap-4 items-start">
              <h3 className="text-xl font-bold">Join our orbit</h3>
              <span className="text-purple-900/80 dark:text-purple-100/80 text-base">
                Tap into behind-the-scenes drops, launch templates, and live AMA sessions with our
                founder.
              </span>
              <Button size="lg" variant="outline" asChild>
                <Link
                  href="https://www.instagram.com/lachicadelaia"
                  target="_blank"
                  rel="noreferrer"
                >
                  Follow @lachicadelaia
                </Link>
              </Button>
              <span className="text-purple-900/70 dark:text-purple-100/70 text-sm">
                Prefer email? Subscribe inside the Instagram bio. We announce every product
                iteration there first.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CommunitySection;
