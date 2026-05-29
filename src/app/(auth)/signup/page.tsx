import { redirect } from "next/navigation";

// Magic-link sign-in self-provisions new accounts, so there is no separate
// signup flow. Preserve the route as a redirect for existing links/bookmarks.
export default function SignupPage() {
  redirect("/login");
}
