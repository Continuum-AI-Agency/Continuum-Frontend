'use client';

/**
 * The facts a user is agreeing to when they confirm a publish.
 *
 * Rendered inside the publish confirmation dialog. These values come from the backend's
 * /publish-intent, which also returns the `intent_hash` the confirmation is bound to — so what is
 * shown here is provably what gets posted. A dialog that only warned "this cannot be undone" was
 * asking the user to approve something they could not see.
 */

export type PublishIntentSummaryData = {
  blockers: { reason: string; message: string }[];
  /**
   * Gaps that do NOT stop the post — an unverified claim is the live example. They belong
   * in front of the person confirming it: the backend has always produced them, and until
   * they were rendered here nobody ever saw one.
   */
  warnings?: { reason: string; message: string }[];
  format: string;
  account: { id: string | null };
  caption: { length: number; preview: string | null };
  media: { count: number; required: number };
};

export function PublishIntentSummary({ intent }: { intent: PublishIntentSummaryData }) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-secondary">Account</dt>
        <dd className="truncate font-medium">{intent.account.id ?? 'No account selected'}</dd>
        <dt className="text-secondary">Format</dt>
        <dd className="font-medium">{intent.format}</dd>
        <dt className="text-secondary">Media</dt>
        <dd className="font-medium">
          {intent.media.count} of {intent.media.required} required
        </dd>
      </dl>

      {intent.caption.preview ? (
        <div>
          <p className="text-secondary mb-1">Caption ({intent.caption.length} characters)</p>
          <p className="border-border bg-muted/40 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border p-2 text-xs">
            {intent.caption.preview}
          </p>
        </div>
      ) : null}

      {intent.blockers.length > 0 ? (
        <ul className="space-y-1">
          {intent.blockers.map((blocker) => (
            <li key={blocker.reason} className="text-destructive text-xs">
              {blocker.message}
            </li>
          ))}
        </ul>
      ) : null}

      {intent.warnings && intent.warnings.length > 0 ? (
        <ul className="space-y-1">
          {intent.warnings.map((warning) => (
            <li key={warning.reason} className="text-xs text-amber-600 dark:text-amber-500">
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
