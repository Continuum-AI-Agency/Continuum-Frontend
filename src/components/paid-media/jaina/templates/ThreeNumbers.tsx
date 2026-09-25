// OWNED BY the three_numbers agent — only that agent edits this file. Recipe:
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md.
//
// `three_numbers` (approved idea 13, "Tres números que importan"). STUB: renders through the generic renderer
// until the owning agent replaces `Hero` / `SectionBody` with the approved design. `registry.tsx`
// already points at this export, so shipping the renderer never touches the registry.

import { genericTemplateRenderer } from './GenericTemplate';
import type { TemplateRenderer } from './types';

export const threeNumbersRenderer: TemplateRenderer = genericTemplateRenderer;
