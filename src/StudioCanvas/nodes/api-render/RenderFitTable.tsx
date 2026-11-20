'use client';

import { checkAssetSwap } from '@continuum/contracts';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InspectorNote, InspectorSection } from '../../components/inspector/controls';
import type { ApiRenderNodeData } from '../../types';
import { apiRenderVariableLabel } from './resolveApiRenderVariables';

/**
 * The numbers behind the picture the node draws.
 *
 * Same closed form, same verdicts — this is the tabular half: per media slot, the predicted box
 * in comp pixels, how far it falls off each edge, and which other layers it would sit on top of.
 * The overlap column is the one that catches the failure a clip check cannot: artwork that fits
 * the canvas perfectly and lands squarely on the legal text.
 *
 * Every figure is an ESTIMATE and labelled as one. A keyframed layer's rest state and an
 * off-centre anchor are what a render still has to confirm — which is why a slot in here is
 * also what sends the finished frame to the judge.
 */
export function RenderFitTable({ data }: { data: ApiRenderNodeData }) {
  const translateUi = useUiTranslations('studio');

  const rows = useMemo(() => {
    const boxes = data.templateLayout?.boxes ?? [];
    return (data.variableDefinitions ?? [])
      .filter(
        (variable) =>
          (variable.kind === 'image' || variable.kind === 'video') && !variable.reserved,
      )
      .map((variable) => ({
        variable,
        verdict: checkAssetSwap({
          key: variable.key,
          placement: variable.placement,
          asset: data.assetDims?.[variable.key] ?? null,
          neighbours: boxes.filter((row) => row.key !== variable.key),
        }),
      }));
  }, [data.assetDims, data.templateLayout, data.variableDefinitions]);

  if (rows.length === 0) return null;

  return (
    <InspectorSection title={translateUi('artwork_placement_c8c5b1bf')}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{translateUi('slot_79689782')}</TableHead>
              <TableHead>{translateUi('lands_09e6b75c')}</TableHead>
              <TableHead>{translateUi('covers_3f8d88db')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ variable, verdict }) => (
              <TableRow key={variable.key}>
                <TableCell className="align-top">
                  <span className="block truncate">{apiRenderVariableLabel(variable)}</span>
                  {verdict.shapeClass ? (
                    <span className="text-2xs text-muted-foreground">{verdict.shapeClass}</span>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">
                  {verdict.state === 'unknown' ? (
                    <Badge variant="muted">{translateUi('not_measured_040f7884')}</Badge>
                  ) : verdict.state === 'clipped' ? (
                    <>
                      <Badge variant="warning">
                        {translateUi('clips_4b782ddc')} {verdict.clippedPx?.join('/')} px
                      </Badge>
                      <span className="mt-0.5 block text-2xs text-muted-foreground tabular-nums">
                        {verdict.box?.map((n) => Math.round(n)).join(', ')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Badge variant="success">{translateUi('in_canvas_59ebd6a5')}</Badge>
                      <span className="mt-0.5 block text-2xs text-muted-foreground tabular-nums">
                        {verdict.box?.map((n) => Math.round(n)).join(', ')}
                      </span>
                    </>
                  )}
                </TableCell>
                <TableCell className="align-top text-2xs text-muted-foreground">
                  {verdict.covers.length === 0
                    ? '—'
                    : verdict.covers
                        .slice(0, 3)
                        .map((row) => `${row.label} ${Math.round(row.coverage * 100)}%`)
                        .join(' · ')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <InspectorNote> {translateUi('estimated_from_the_uploaded_project_6ffe843a')} </InspectorNote>
    </InspectorSection>
  );
}
