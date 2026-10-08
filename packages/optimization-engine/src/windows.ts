// A trailing window and the number of days it is worth.
//
// Every per-day figure the engine prints — `estImpactPerDay`, the "$X a day" a pause
// headline leads with, the delivery-held ratio behind a displacement call — is a window
// total divided by a day count. Written as a literal, that divisor is a second, silent copy
// of the window's span: `d3.spend / 3` stays compiling and stays wrong the moment the ingest
// builds d3 over a different number of days, which is exactly how a `d7` that summed eight
// dates reached every rate on a card as a 12.5% overstatement.
//
// So the divisor is read off the window's NAME. There is one number, it is in the name the
// reader already sees, and the two cannot drift apart.

import type { EvidenceWindow } from './types';

/** A trailing window key. `d7` is seven days, `d14` fourteen — the name IS the span. */
export type WindowKey = EvidenceWindow | 'd30';

/** The days a window's name promises, parsed from the name. */
export const windowSpanDays = (key: WindowKey): number => Number(key.slice(1));

/** A window total as a per-day rate over the days that window covers. */
export const perDayOver = (total: number, key: WindowKey): number => total / windowSpanDays(key);
