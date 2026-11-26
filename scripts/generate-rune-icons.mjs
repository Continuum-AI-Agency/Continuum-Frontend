// Generates src/components/icons/rune.generated.ts from the runeicons-react devDependency.
// Run after bumping runeicons-react: `bun run icons:generate`, then format the output from
// the monorepo root with `bun run biome:write -- Continuum-Frontend/src/components/icons/rune.generated.ts`.
//
// Rune's own components accept only `size`, and every path hard-codes its stroke, so a
// `className="fill-…"` or `strokeWidth` from a call site cannot reach it. This lifts the
// shared stroke attributes onto the root <svg> (see createIcon.tsx) and keeps only what
// differs per element, which is how lucide renders and what our call sites expect.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.join(process.cwd(), 'package.json'));
// The package exports no ./package.json, so it is found through its main entry (dist/index.js).
const packageDir = path.dirname(path.dirname(require.resolve('runeicons-react')));
const { version } = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
const { ICONS } = await import(
  pathToFileURL(path.join(packageDir, 'dist/icons.generated.js')).href
);

const outDir = path.join(process.cwd(), 'src/components/icons');
const DEFAULT_VIEW_BOX = '0 0 24 24';
const ROOT_STROKE = {
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};
// What an element would have had without the root's attributes, written out wherever it
// leaned on the SVG default, so lifting the stroke to the root changes no pixel.
const SVG_DEFAULTS = {
  stroke: 'none',
  'stroke-width': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
};
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

function parseMarkup(markup) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  for (const [, closing, tag, rawAttrs, selfClosing] of markup.matchAll(
    /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g,
  )) {
    if (closing) {
      stack.pop();
      continue;
    }
    const attrs = Object.fromEntries(
      [...rawAttrs.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]),
    );
    const node = { tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root.children;
}

function coversViewBox(clipPath, viewBox) {
  const [, , w, h] = viewBox.split(' ');
  const [shape] = clipPath.children;
  return (
    clipPath.children.length === 1 &&
    shape.tag === 'rect' &&
    !shape.attrs.x &&
    !shape.attrs.y &&
    shape.attrs.width === w &&
    shape.attrs.height === h
  );
}

// Figma exports wrap glyphs in `<g fill="none">` and a clip group whose clip is the whole
// viewBox; both are no-ops once the root carries fill="none", so they are unwrapped.
function simplify(nodes, viewBox) {
  const noOpClipIds = new Set(
    nodes
      .filter((n) => n.tag === 'defs')
      .flatMap((d) => d.children)
      .filter((c) => c.tag === 'clipPath' && coversViewBox(c, viewBox))
      .map((c) => c.attrs.id),
  );
  return nodes.flatMap((node) => {
    if (node.tag === 'g' && Object.keys(node.attrs).length === 1 && node.attrs.fill === 'none') {
      return simplify(node.children, viewBox);
    }
    const clipId = node.attrs['clip-path']?.match(/^url\(#(.+)\)$/)?.[1];
    if (node.tag === 'g' && clipId && noOpClipIds.has(clipId)) {
      return simplify(node.children, viewBox);
    }
    if (node.tag === 'defs') {
      const kept = node.children.filter((c) => !noOpClipIds.has(c.attrs.id));
      return kept.length ? [{ ...node, children: kept }] : [];
    }
    return [{ ...node, children: simplify(node.children, viewBox) }];
  });
}

function liftRootStroke(node, insideDefs = false) {
  const attrs = { ...node.attrs };
  if (SHAPES.has(node.tag) && !insideDefs) {
    for (const [key, rootValue] of Object.entries(ROOT_STROKE)) {
      if (attrs[key] === rootValue) delete attrs[key];
      else if (attrs[key] === undefined) attrs[key] = SVG_DEFAULTS[key];
    }
    if (attrs.stroke === 'none') {
      for (const key of ['stroke-width', 'stroke-linecap', 'stroke-linejoin']) delete attrs[key];
    }
  }
  const nextInsideDefs = insideDefs || node.tag === 'defs';
  return { ...node, attrs, children: node.children.map((c) => liftRootStroke(c, nextInsideDefs)) };
}

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const pascal = (id) =>
  id
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');

function serialize(node) {
  const attrs = `{ ${Object.entries(node.attrs)
    .map(([k, v]) => `${camel(k)}: ${JSON.stringify(v)}`)
    .join(', ')} }`;
  const children = node.children.length ? `, [${node.children.map(serialize).join(', ')}]` : '';
  return `['${node.tag}', ${attrs}${children}]`;
}

const lines = [];
const seen = new Set();
for (const icon of ICONS) {
  const normal = icon.variants.normal;
  if (!normal) continue;
  // Ids are `<category>-<name>`; the component name drops the category, as runeicons-react does.
  const slug = icon.id.slice(icon.id.indexOf('-') + 1);
  const name = pascal(slug);
  if (seen.has(name)) throw new Error(`Two Rune glyphs map to ${name}`);
  seen.add(name);
  const nodes = simplify(parseMarkup(normal.markup), normal.viewBox).map((n) => liftRootStroke(n));
  const viewBox = normal.viewBox === DEFAULT_VIEW_BOX ? '' : `, ${JSON.stringify(normal.viewBox)}`;
  lines.push(
    `export const ${name} = /* @__PURE__ */ createIcon('${slug}', [${nodes.map(serialize).join(', ')}]${viewBox});`,
  );
}

writeFileSync(
  path.join(outDir, 'rune.generated.ts'),
  `// Generated by scripts/generate-rune-icons.mjs from runeicons-react@${version}. Do not edit.
// Rune Icons (https://runeicons.com) are licensed under Apache-2.0; see RUNEICONS_LICENSE.

import { createIcon } from './createIcon';

${lines.join('\n')}
`,
);
writeFileSync(
  path.join(outDir, 'RUNEICONS_LICENSE'),
  readFileSync(path.join(packageDir, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'),
);
console.log(`Wrote ${lines.length} Rune glyphs from runeicons-react@${version}`);
