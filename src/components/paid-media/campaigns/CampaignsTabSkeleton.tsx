const bar = 'rounded-md bg-muted/70 motion-safe:animate-pulse';

/** The Campaigns tab's frame while its chunk loads: header line, column heads, hairline rows. */
export function CampaignsTabSkeleton() {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-3">
        <div className={`h-5 w-40 ${bar}`} />
        <div className={`h-6 w-16 ${bar}`} />
      </div>
      <div className="min-h-0 overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_7rem_6rem] gap-4 border-border/60 border-b px-1 py-2.5">
          <div className={`h-3 w-16 ${bar}`} />
          <div className={`ml-auto h-3 w-14 ${bar}`} />
          <div />
        </div>
        {Array.from({ length: 7 }, (_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_7rem_6rem] items-center gap-4 border-border/60 border-b px-1 py-3"
          >
            <div className="flex items-center gap-2">
              <div className={`size-5 ${bar}`} />
              <div className={`h-4 ${bar}`} style={{ width: `${55 - (index % 3) * 12}%` }} />
            </div>
            <div className={`ml-auto h-4 w-16 ${bar}`} />
            <div />
          </div>
        ))}
      </div>
    </div>
  );
}
