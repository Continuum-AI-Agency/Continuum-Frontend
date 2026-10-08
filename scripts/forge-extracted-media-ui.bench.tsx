/** Called by the local extraction E2E bench with its actual persisted variables response. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apiRenderVariableSchema, templateSourceSlotSchema } from '@continuum/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { VariableEditor } from '@/components/forge/VariableEditor';

// Library slot keys are the parser's slugs; render field keys have a stricter alphabet.
const response = z
  .object({
    variables: z.array(apiRenderVariableSchema.extend({ key: z.string().min(1) })),
    edits: z.array(templateSourceSlotSchema),
  })
  .parse(JSON.parse(readFileSync(process.argv[2]!, 'utf8')));
const savedDefaults = Object.fromEntries(
  response.edits.map((edit) => [edit.slotKey, edit.defaultValue]),
);
const images = response.variables.filter(
  (variable) => variable.kind === 'image' && savedDefaults[variable.key],
);
assert(images.length > 0, 'The real backend response must contain pinned authored images');
const html = renderToStaticMarkup(
  <VariableEditor
    brandId="00000000-0000-4000-8000-0000000000b2"
    variables={response.variables}
    savedDefaults={savedDefaults}
    parseState="parsed"
    saving={false}
    onSave={async () => true}
  />,
);
assert.equal(
  (html.match(/Library image/g) ?? []).length,
  images.length,
  'Every authored default must appear in the real editor without a user override',
);
console.log(
  `PASS real editor shows ${images.length} Library image defaults from the persisted source`,
);
