import { redirect } from 'next/navigation';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Magic-link sign-in self-provisions new accounts, so there is no separate
// signup flow. Preserve the route as a redirect for existing links/bookmarks.
export default function SignupPage() {
  redirect('/login');
}
