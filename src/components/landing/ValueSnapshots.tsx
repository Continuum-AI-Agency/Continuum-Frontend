const beforeBullets = [
  'Manual tab-hopping between social, paid, and analytics tools',
  'Creative briefs lost in chats and inconsistent brand voice',
  'Reporting stitched together weekly with spreadsheets',
];

const afterBullets = [
  'OAuth onboarding links every channel with role-based control in minutes',
  'AI-generated calendars keep every caption, prompt, and asset on-brand',
  'Unified analytics surface cross-platform ROI in real time',
];

export function ValueSnapshots() {
  return (
    <div className="relative">
      <div className="mx-auto w-full max-w-4xl py-20">
        <div className="flex flex-col gap-8">
          <h2 className="text-2xl font-bold">See the delta Continuum delivers</h2>
          <span className="max-w-3xl text-base text-muted-foreground">
            Teams who move to Continuum compress onboarding to five minutes, publish a week of
            content in under an hour, and review organic plus paid performance without stitching
            dashboards together.
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="border border-rose-300/50 bg-rose-100/30 p-6 shadow-sm backdrop-blur dark:border-rose-500/40 dark:bg-rose-500/10">
              <h3 className="text-rose-600 dark:text-rose-300 text-lg font-bold">
                Before Continuum
              </h3>
              <div className="mt-4 space-y-3">
                {beforeBullets.map((bullet) => (
                  <span
                    key={bullet}
                    className="flex items-start gap-2 text-slate-700 dark:text-slate-200 text-base"
                  >
                    <span className="mt-1 h-2 w-2 rounded-full bg-rose-500" />
                    <span>{bullet}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="border border-emerald-300/60 bg-emerald-100/40 p-6 shadow-lg backdrop-blur dark:border-emerald-500/40 dark:bg-emerald-500/10">
              <h3 className="text-emerald-700 dark:text-emerald-300 text-lg font-bold">
                With Continuum
              </h3>
              <div className="mt-4 space-y-3">
                {afterBullets.map((bullet) => (
                  <span
                    key={bullet}
                    className="flex items-start gap-2 text-slate-700 dark:text-slate-200 text-base"
                  >
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                    <span>{bullet}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ValueSnapshots;
