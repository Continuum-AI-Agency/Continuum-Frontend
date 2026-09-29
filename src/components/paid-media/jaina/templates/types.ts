// The contract a template renderer fulfils. `TemplateBlock` owns the frame — the executive
// sentence, the layout, the section titles and texts — and asks the template's renderer for
// the two things only it knows how to draw: the chart beside the sentence, and what goes
// under each section's text. A renderer never prints a number itself: every value comes from
// `block.figures` through `FigureText` / `FigureById` / `TemplateChartView`, which put the
// figure's id, raw value, currency, window and source on the element.

import type { TemplateSection } from '@continuum/contracts';
import type { ComponentType } from 'react';
import type { AnswerTemplateBlockV2 } from '@/lib/jaina/schemas';

export type TemplateHeroProps = { block: AnswerTemplateBlockV2 };
export type TemplateSectionBodyProps = { block: AnswerTemplateBlockV2; section: TemplateSection };

export type TemplateRenderer = {
  Hero: ComponentType<TemplateHeroProps>;
  SectionBody: ComponentType<TemplateSectionBodyProps>;
};
