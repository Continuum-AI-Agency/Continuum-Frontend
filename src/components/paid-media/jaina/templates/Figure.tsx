'use client';

// A figure on screen is always an element that says which figure it is.
//
// Every number a templated answer shows comes from the block's `figures` list — the Backend
// composed each one from a real read — and is rendered here, with the raw value, currency,
// window and source on the element. A test (or a parity bench) reads those attributes and
// checks the printed text against the raw value, the same pattern as the optimizer's
// `figureProps`. Prose carries `{figure_id}` refs; `FigureText` turns each into a figure
// element and never prints a ref it cannot resolve.

import {
  type FigureRefSegment,
  figureRefSegments,
  normalizeCurrencyCode,
  type TemplateFigure,
} from '@continuum/contracts';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';

export type FigureAttributes = {
  'data-testid': 'figure';
  'data-figure-id': string;
  'data-figure-raw': string;
  'data-figure-currency': string;
  'data-figure-unit': TemplateFigure['unit'];
  'data-figure-window': string;
  'data-figure-source': string;
};

export function figureAttributes(figure: TemplateFigure): FigureAttributes {
  return {
    'data-testid': 'figure',
    'data-figure-id': figure.id,
    'data-figure-raw':
      figure.value == null || !Number.isFinite(figure.value) ? '' : String(figure.value),
    'data-figure-currency': normalizeCurrencyCode(figure.currency) ?? 'none',
    'data-figure-unit': figure.unit,
    'data-figure-window': `${figure.window.since}..${figure.window.until}`,
    'data-figure-source': `${figure.source.tool}:${figure.source.datasetId}`,
  };
}

/** What a figure is and where it came from, for the hover title. */
export function figureTitle(figure: TemplateFigure): string {
  const derivation = figure.derivation ? ` = ${figure.derivation}` : '';
  return `${figure.label}${derivation} · ${figure.window.label} · ${figure.source.tool}`;
}

export function figureById(
  figures: ReadonlyArray<TemplateFigure>,
  id: string | null | undefined,
): TemplateFigure | null {
  if (!id) return null;
  return figures.find((figure) => figure.id === id) ?? null;
}

type FigureValueProps = { figure: TemplateFigure; text: string; className?: string };

export function FigureValue({ figure, text, className }: FigureValueProps) {
  return (
    <span
      {...figureAttributes(figure)}
      title={figureTitle(figure)}
      className={cn('font-semibold tabular-nums text-foreground', className)}
    >
      {text}
    </span>
  );
}

const renderSegment = (segment: FigureRefSegment, index: number, figureClassName?: string) => {
  if (segment.kind === 'text') return <Fragment key={index}>{segment.text}</Fragment>;
  if (segment.kind === 'figure') {
    return (
      <FigureValue
        key={index}
        figure={segment.figure}
        text={segment.text}
        className={figureClassName}
      />
    );
  }
  // An unresolved ref is a Backend defect `validateTemplateBlock` should have stopped; the
  // reader gets a dash, never the raw `{id}`.
  return (
    <span key={index} data-figure-unresolved={segment.ref}>
      —
    </span>
  );
};

type FigureTextProps = {
  text: string;
  figures: ReadonlyArray<TemplateFigure>;
  figureClassName?: string;
};

/** Prose with each `{figure_id}` rendered as its figure element. */
export function FigureText({ text, figures, figureClassName }: FigureTextProps) {
  return (
    <>
      {figureRefSegments(text, figures).map((segment, index) =>
        renderSegment(segment, index, figureClassName),
      )}
    </>
  );
}

/** One figure by id, printed by the contracts' formatter; nothing when the id is unknown. */
export function FigureById({
  figures,
  id,
  className,
}: {
  figures: ReadonlyArray<TemplateFigure>;
  id: string | null | undefined;
  className?: string;
}) {
  const figure = figureById(figures, id);
  if (!figure) return null;
  return <FigureText text={`{${figure.id}}`} figures={[figure]} figureClassName={className} />;
}
