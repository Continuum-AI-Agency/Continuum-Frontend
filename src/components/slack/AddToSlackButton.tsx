import { cn } from '@/lib/utils';

/**
 * Slack's official "Add to Slack" button.
 *
 * The href is OURS — `/api/chat/slack/install/start` — never the ready-made authorize URL Slack
 * prints on the app's Manage Distribution page. That URL carries no `state`, so our callback
 * cannot tell a real install from a code someone injected, and it names no brand, so the
 * workspace lands with nothing to connect it to. `/install/start` sets the browser-bound nonce
 * cookie, signs the state, carries the brand, and then 302s to exactly that authorize URL — which
 * is also what Slack's Direct Install URL rule requires.
 *
 * Slack's brand guidelines want this asset used unmodified, so it is a plain `<img>` at its
 * published size rather than a re-drawn button or a `next/image` transform.
 */
export function AddToSlackButton({
  href,
  label = 'Add to Slack',
  className,
}: {
  href: string;
  /** "Reinstall" and the like — the button art is fixed, this is what a screen reader hears. */
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className={cn('inline-flex w-fit rounded-[4px] focus-visible:outline-2', className)}
    >
      {/** biome-ignore lint/performance/noImgElement: Slack's asset, served at a fixed size from their CDN. */}
      <img
        alt={label}
        height={40}
        width={139}
        src="https://platform.slack-edge.com/img/add_to_slack.png"
        srcSet="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x"
      />
    </a>
  );
}
