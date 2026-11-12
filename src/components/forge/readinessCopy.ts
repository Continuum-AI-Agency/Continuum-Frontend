import type { useTranslations } from 'next-intl';

type ForgeReadinessText = ReturnType<typeof useTranslations<'forge'>>;

import {
  type ApiRenderBatchReadiness,
  type ApiRenderReadinessFinding,
  leavesCheckIncomplete,
  READINESS_CODE,
} from '@continuum/contracts';

/** A variable's label from its key; undefined when the finding names no variable. */
export type LabelOf = (key: string | undefined) => string | undefined;

type Finding = Pick<ApiRenderReadinessFinding, 'code' | 'message' | 'variableKey'>;

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * What a finding means for the person rendering: what was not checked, why, and what — if
 * anything — makes it checkable. The grid's "Needs review" hover and the tray say the same words.
 */
export function explainFinding(
  finding: Finding,
  labelOf: LabelOf,
  translate?: ForgeReadinessText,
): string {
  if (translate) {
    const label =
      labelOf(finding.variableKey) ?? finding.variableKey ?? translate('readinessThisSlot');
    const key =
      finding.code === 'BRAND_PALETTE_UNKNOWN'
        ? 'readinessPaletteUnknown'
        : finding.code === 'FONT_INVENTORY_UNKNOWN'
          ? 'readinessFontsUnknown'
          : finding.code === READINESS_CODE.fitUnknown
            ? 'readinessPlacementUnknown'
            : finding.code === READINESS_CODE.checkedAfterRender
              ? 'readinessAfterRender'
              : 'readinessUnknownFinding';
    return translate(key, { label });
  }
  const label = labelOf(finding.variableKey) ?? finding.variableKey ?? 'This slot';
  switch (finding.code) {
    case 'BRAND_PALETTE_UNKNOWN':
      return `${label}’s colour isn’t checked: the brand has no colour palette yet. Add one in the Design System to check it.`;
    case 'FONT_INVENTORY_UNKNOWN':
      return 'The template’s fonts haven’t been checked yet. Re-parse the template to check them.';
    case READINESS_CODE.fitUnknown:
      return `Where ${label} lands can’t be measured before rendering: the template has no measured placement for it. Re-parse the template to check it.`;
    case READINESS_CODE.checkedAfterRender:
      return `${label} can only be checked on the finished frame, so an AI check looks at it after it renders.`;
    default:
      return finding.variableKey ? `${label}: ${finding.message}` : finding.message;
  }
}

/** The few words a footer has room for. */
function shortReason(finding: Finding, labelOf: LabelOf): string {
  const label = labelOf(finding.variableKey) ?? finding.variableKey ?? 'a slot';
  switch (finding.code) {
    case 'BRAND_PALETTE_UNKNOWN':
      return 'the brand has no colour palette to check against';
    case 'FONT_INVENTORY_UNKNOWN':
      return 'the template’s fonts haven’t been checked';
    case READINESS_CODE.fitUnknown:
      return `${label} has no measured placement`;
    default:
      return finding.message;
  }
}

/** Every distinct reason, once each — the tray's hover lists these. */
export function readinessReasons(
  readiness: ApiRenderBatchReadiness,
  labelOf: LabelOf,
  translate?: ForgeReadinessText,
): string[] {
  return [
    ...new Set(
      readiness.findings
        .filter((finding) => finding.severity === 'unknown')
        .map((finding) => explainFinding(finding, labelOf, translate)),
    ),
  ];
}

/** The tray's verdict line: what is ready, and when it is not all checked, the reason that is not. */
export function readinessLine(
  readiness: ApiRenderBatchReadiness,
  labelOf: LabelOf,
  translate?: ForgeReadinessText,
): string {
  if (translate) {
    if (readiness.state === 'BLOCKED')
      return translate('readinessBlocked', { count: readiness.blockedRows });
    if (readiness.state === 'INCOMPLETE') {
      const reasons = [
        ...new Set(
          readiness.findings.filter(leavesCheckIncomplete).map((finding) => {
            const label =
              labelOf(finding.variableKey) ?? finding.variableKey ?? translate('readinessThisSlot');
            const key =
              finding.code === 'BRAND_PALETTE_UNKNOWN'
                ? 'readinessPaletteShort'
                : finding.code === 'FONT_INVENTORY_UNKNOWN'
                  ? 'readinessFontsShort'
                  : finding.code === READINESS_CODE.fitUnknown
                    ? 'readinessPlacementShort'
                    : 'readinessUnknownShort';
            return translate(key, { label });
          }),
        ),
      ];
      return translate('readinessIncomplete', {
        count: readiness.unknownRows,
        reason: reasons[0] ?? translate('readinessUnknownShort'),
        more: Math.max(0, reasons.length - 1),
      });
    }
    const after = [
      ...new Set(
        readiness.findings
          .filter((finding) => finding.code === READINESS_CODE.checkedAfterRender)
          .map(
            (finding) =>
              labelOf(finding.variableKey) ?? finding.variableKey ?? translate('readinessThisSlot'),
          ),
      ),
    ];
    return after.length
      ? translate('readinessCheckedAfter', {
          count: readiness.totalRows,
          slots: after.length,
          label: after[0] ?? '',
        })
      : translate('readinessChecked', { count: readiness.totalRows });
  }
  if (readiness.state === 'BLOCKED')
    return `Blocked · ${plural(readiness.blockedRows, 'row')} can’t render as they are`;
  if (readiness.state === 'INCOMPLETE') {
    const reasons = [
      ...new Set(
        readiness.findings
          .filter(leavesCheckIncomplete)
          .map((finding) => shortReason(finding, labelOf)),
      ),
    ];
    const more = reasons.length > 1 ? ` (+${reasons.length - 1} more)` : '';
    return `Check incomplete · ${plural(readiness.unknownRows, 'row')}: ${reasons[0]}${more} — they can still render`;
  }
  const afterRender = [
    ...new Set(
      readiness.findings
        .filter((finding) => finding.code === READINESS_CODE.checkedAfterRender)
        .map((finding) => labelOf(finding.variableKey) ?? finding.variableKey ?? 'a slot'),
    ),
  ];
  if (!afterRender.length) return `Can render · ${plural(readiness.totalRows, 'row')} checked`;
  const named =
    afterRender.length === 1 ? `${afterRender[0]} is` : `${afterRender.length} slots are`;
  return `Can render · ${plural(readiness.totalRows, 'row')} · ${named} checked after render`;
}
