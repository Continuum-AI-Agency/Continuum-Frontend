'use client';

import { usePathname as useNextPathname } from 'next/navigation';
import { externalPathname } from './paths';

export { default as Link } from 'next/link';
export { useRouter } from 'next/navigation';

/** Visible URLs use Next's router; remove the internal segment during server rendering. */
export function usePathname() {
  return externalPathname(useNextPathname());
}
