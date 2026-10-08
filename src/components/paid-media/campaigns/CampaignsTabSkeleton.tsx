const bar = 'rounded-md bg-muted/70 motion-safe:animate-pulse';

/** The Campaigns tab's frame while its chunk loads: header, column heads, rows. */
export function CampaignsTabSkeleton() {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border/70 bg-background">
      <div className="flex items-center justify-between gap-3 border-border/70 border-b px-4 py-3">
        <div className={`h-5 w-40 ${bar}`} />
        <div className={`h-7 w-24 ${bar}`} />
      </div>
      <div className="min-h-0 overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_9rem_8rem_7rem] gap-4 border-border/70 border-b bg-muted/20 px-4 py-2.5">
          <div className={`h-3 w-16 ${bar}`} />
          <div className={`h-3 w-12 ${bar}`} />
          <div className={`ml-auto h-3 w-14 ${bar}`} />
          <div />
        </div>
        {Array.from({ length: 7 }, (_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_9rem_8rem_7rem] items-center gap-4 border-border/50 border-b px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <div className={`size-5 ${bar}`} />
              <div className={`h-4 ${bar}`} style={{ width: `${55 - (index % 3) * 12}%` }} />
            </div>
            <div className={`h-5 w-16 rounded-full ${bar}`} />
            <div className={`ml-auto h-4 w-16 ${bar}`} />
            <div className={`ml-auto h-7 w-20 ${bar}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
