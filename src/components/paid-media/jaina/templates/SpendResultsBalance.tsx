// OWNED BY the spend_results_balance agent — only that agent edits this file. Recipe:
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md.
//
// `spend_results_balance` (approved idea 15, "Balanza de gasto contra resultados"). STUB: renders through the generic renderer
// until the owning agent replaces `Hero` / `SectionBody` with the approved design. `registry.tsx`
// already points at this export, so shipping the renderer never touches the registry.

import { genericTemplateRenderer } from './GenericTemplate';
import type { TemplateRenderer } from './types';

export const spendResultsBalanceRenderer: TemplateRenderer = genericTemplateRenderer;
