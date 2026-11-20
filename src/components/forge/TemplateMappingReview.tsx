import type { TemplateMappingReview } from '@continuum/contracts';
import { readableLayerName } from '@continuum/contracts';
import { useTranslations as useUiTranslations } from 'next-intl';

export function TemplateMappingReviewPanel({ review }: { review: TemplateMappingReview | null }) {
  const translateUi = useUiTranslations('forge');

  if (!review || review.state === 'unavailable') {
    return (
      <p className="text-sm text-muted-foreground">
        {translateUi('build_the_template_to_compare_its_f_e75820d2')}
      </p>
    );
  }
  const additional = review.fields.filter((field) => field.match === 'forge_only').length;
  return (
    <div className="space-y-3 text-sm">
      <p>
        <strong>
          {review.matchedSlots} {translateUi('of_28391d3b')} {review.slotCount}
        </strong>{' '}
        {translateUi('editable_after_effects_layers_conne_bf64e6b4')}{' '}
        {additional
          ? translateUi('value0_additional_forge_fields_edc52165', { count: Number(additional) })
          : ''}
        .
        {!review.identityAvailable
          ? translateUi('layer_ids_were_unavailable_matches__a068df2b')
          : ''}
      </p>
      {review.unmatchedSlots.length > 0 ? (
        <div className="rounded-md border border-destructive/50 p-3" role="alert">
          <p className="font-medium">
            {translateUi('these_editable_layers_have_no_forge_169ce90e')}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {review.unmatchedSlots.map((slot) => (
              <li key={slot.key}>
                {readableLayerName(slot.name)} · {slot.kind} · {slot.comps.join(', ')}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted-foreground">
            {translateUi('correct_the_after_effects_project_o_0458d27f')}
          </p>
        </div>
      ) : null}
      {review.ignoredSlots.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {translateUi('ignoredPlaceholderCount', { count: review.ignoredSlots.length })}{' '}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">
            {translateUi('forge_fields_and_after_effects_laye_e8561556')}
          </caption>
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{translateUi('forge_field_34d4b335')}</th>
              <th className="px-3 py-2 font-medium">{translateUi('type_baaddf70')}</th>
              <th className="px-3 py-2 font-medium">
                {translateUi('after_effects_layer_99112d05')}
              </th>
              <th className="px-3 py-2 font-medium">{translateUi('formats_9f01769a')}</th>
              <th className="px-3 py-2 font-medium">{translateUi('authored_value_24696eda')}</th>
              <th className="px-3 py-2 font-medium">{translateUi('check_9d60841e')}</th>
            </tr>
          </thead>
          <tbody>
            {review.fields.map((field) => (
              <tr key={field.key} className="border-t align-top">
                <td className="px-3 py-2 font-medium">{readableLayerName(field.label)}</td>
                <td className="px-3 py-2">{field.kind}</td>
                <td className="px-3 py-2">
                  {field.slotName ? readableLayerName(field.slotName) : '—'}
                </td>
                <td className="px-3 py-2">{field.comps.join(', ') || '—'}</td>
                <td className="max-w-52 truncate px-3 py-2" title={field.sample ?? undefined}>
                  {field.sample?.trim() || '—'}
                </td>
                <td className="px-3 py-2">
                  {field.match === 'layer_id'
                    ? translateUi('layer_id_38345512')
                    : field.match === 'name'
                      ? translateUi('name_only_a10f973b')
                      : field.match === 'ambiguous'
                        ? translateUi('ambiguous_70a8b691')
                        : translateUi('forge_only_53d95a49')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {translateUi('this_checks_field_wiring_review_a_f_3a5d24ad')}
      </p>
    </div>
  );
}
