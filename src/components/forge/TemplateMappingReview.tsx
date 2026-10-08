import type { TemplateMappingReview } from '@continuum/contracts';
import { readableLayerName } from '@continuum/contracts';

export function TemplateMappingReviewPanel({ review }: { review: TemplateMappingReview | null }) {
  if (!review || review.state === 'unavailable') {
    return <p className="text-sm text-muted-foreground">Build the template to compare its Forge fields with the After Effects layers.</p>;
  }
  const additional = review.fields.filter((field) => field.match === 'forge_only').length;
  return (
    <div className="space-y-3 text-sm">
      <p>
        <strong>{review.matchedSlots} of {review.slotCount}</strong> editable After Effects layers connected
        {additional ? ` · ${additional} additional Forge fields` : ''}.
        {!review.identityAvailable ? ' Layer IDs were unavailable; matches use names.' : ''}
      </p>
      {review.unmatchedSlots.length > 0 ? (
        <div className="rounded-md border border-destructive/50 p-3" role="alert">
          <p className="font-medium">These editable layers have no Forge field:</p>
          <ul className="mt-1 list-disc pl-5">
            {review.unmatchedSlots.map((slot) => (
              <li key={slot.key}>{readableLayerName(slot.name)} · {slot.kind} · {slot.comps.join(', ')}</li>
            ))}
          </ul>
          <p className="mt-2 text-muted-foreground">Correct the After Effects project or answer Forge’s mapping questions, then build again.</p>
        </div>
      ) : null}
      {review.ignoredSlots.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {review.ignoredSlots.length} blank text {review.ignoredSlots.length === 1 ? 'placeholder' : 'placeholders'} with no visible bounds excluded from the mapping count.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Forge fields and After Effects layers</caption>
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Forge field</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">After Effects layer</th>
              <th className="px-3 py-2 font-medium">Formats</th>
              <th className="px-3 py-2 font-medium">Authored value</th>
              <th className="px-3 py-2 font-medium">Check</th>
            </tr>
          </thead>
          <tbody>
            {review.fields.map((field) => (
              <tr key={field.key} className="border-t align-top">
                <td className="px-3 py-2 font-medium">{readableLayerName(field.label)}</td>
                <td className="px-3 py-2">{field.kind}</td>
                <td className="px-3 py-2">{field.slotName ? readableLayerName(field.slotName) : '—'}</td>
                <td className="px-3 py-2">{field.comps.join(', ') || '—'}</td>
                <td className="max-w-52 truncate px-3 py-2" title={field.sample ?? undefined}>{field.sample?.trim() || '—'}</td>
                <td className="px-3 py-2">
                  {field.match === 'layer_id' ? 'Layer ID' : field.match === 'name' ? 'Name only' : field.match === 'ambiguous' ? 'Ambiguous' : 'Forge only'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">This checks field wiring. Review a full render in every format for animation, crop, and logos.</p>
    </div>
  );
}
