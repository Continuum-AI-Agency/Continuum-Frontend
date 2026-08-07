'use client';

// The `continuum-design-system` bundle.
//
// Built in the browser with the same fflate the brand-system export already uses, for
// the same reason: the payload is already resident, and a round trip to the server to
// zip data the client is holding buys nothing.
//
// The bundle is deliberately IMPORTABLE — `_ds_manifest.json` and `colors_and_type.css`
// are written in the shapes `parseDesignSystemExport` reads, so exporting from
// Continuum and re-uploading the result reproduces the same system. An export-only
// format drifts, because nothing ever proves it can be read back.

import type { DesignSystemSnapshot } from '@continuum/contracts';
import {
  DESIGN_SECTION_LABELS,
  renderDesignSystemStylesheet,
  stripInternalKeys,
} from '@continuum/contracts';
import { zipSync } from 'fflate';

const encoder = new TextEncoder();
const text = (value: string): Uint8Array => encoder.encode(value);

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** DTCG 2025.10 — the dialect the brand-system export already emits. */
function dtcgDocument(snapshot: DesignSystemSnapshot): Record<string, unknown> {
  const tokens: Record<string, unknown> = {};
  for (const token of snapshot.tokens) {
    tokens[token.name.replace(/^--/, '')] = {
      $type:
        token.kind === 'color'
          ? 'color'
          : token.kind === 'font'
            ? 'fontFamily'
            : token.kind === 'dimension'
              ? 'dimension'
              : 'other',
      $value: token.resolvedValue ?? token.value,
      ...(token.description ? { $description: token.description } : {}),
    };
  }
  return {
    $schema: 'https://www.designtokens.org/schemas/2025.10/format.json',
    brand: tokens,
  };
}

/**
 * The manifest, in the shape our own importer reads.
 *
 * Writing `_ds_manifest.json` rather than a Continuum-specific index is what closes
 * the loop: this file is the same one the Claude design-system exporter produces, so a
 * bundle exported here can be re-imported here, handed to a Claude skill, or opened by
 * any other tool that already understands the format.
 */
function dsManifest(snapshot: DesignSystemSnapshot): Record<string, unknown> {
  return {
    namespace: 'ContinuumDesignSystem',
    globalCssPaths: ['colors_and_type.css'],
    tokens: snapshot.tokens.map((token) => ({
      name: token.name,
      value: token.value,
      kind: token.kind,
      definedIn: token.definedIn ?? 'colors_and_type.css',
    })),
    brandFonts: snapshot.fonts.map((font) => ({ family: font.family, tokens: font.tokens })),
    cards: snapshot.sections.flatMap((section) =>
      section.exemplars.map((exemplar) => ({
        path: exemplar.path,
        group: DESIGN_SECTION_LABELS[section.section],
        name: exemplar.name,
        ...(exemplar.subtitle ? { subtitle: exemplar.subtitle } : {}),
        ...(exemplar.viewport ? { viewport: exemplar.viewport } : {}),
      })),
    ),
  };
}

function adherenceConfig(snapshot: DesignSystemSnapshot): Record<string, unknown> {
  const restricted: Array<Record<string, string>> = [];
  if (snapshot.adherence.forbidRawHex) {
    restricted.push({
      selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
      message: 'Raw hex color — use a design-system color token via var().',
    });
  }
  if (snapshot.adherence.forbidRawPx) {
    restricted.push({
      selector: 'Literal[value=/\\b\\d+px\\b/]',
      message: 'Raw px value — use a design-system spacing token via var().',
    });
  }
  return {
    rules: { 'no-restricted-syntax': ['warn', ...restricted] },
    'x-omelette': {
      tokens: snapshot.adherence.tokenAllowlist,
      fontFamilies: snapshot.adherence.fontAllowlist,
    },
  };
}

function sectionMarkdown(section: DesignSystemSnapshot['sections'][number]): string {
  const lines = [`# ${section.title}`, ''];
  if (section.summary) lines.push(section.summary, '');
  if (section.rules.length > 0) {
    lines.push('## Rules', '');
    for (const rule of section.rules) {
      lines.push(`- **${rule.strength === 'hard' ? 'Must' : 'Prefer'}** — ${rule.statement}`);
    }
    lines.push('');
  }
  if (section.exemplars.length > 0) {
    lines.push('## Reference pieces', '');
    for (const exemplar of section.exemplars) {
      lines.push(`- \`${exemplar.path}\` — ${exemplar.name}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function readme(snapshot: DesignSystemSnapshot): string {
  const tier = snapshot.rigor.override ?? snapshot.rigor.tier;
  return [
    `# ${snapshot.brandName} — design system`,
    '',
    'Exported from Continuum.',
    '',
    `- \`_ds_manifest.json\` — token and card index (re-importable)`,
    `- \`colors_and_type.css\` — the tokens as CSS custom properties`,
    `- \`tokens.tokens.json\` — DTCG 2025.10, for Figma or Style Dictionary`,
    `- \`_adherence.oxlintrc.json\` — the machine-checkable rules`,
    `- \`sections/\` — every section as markdown`,
    '',
    `Applied at **${tier}** rigor: ${
      tier === 'strict'
        ? 'generations must comply, and violations are rejected.'
        : tier === 'guided'
          ? 'shapes every generation, and a brief can override it.'
          : 'used as direction rather than as a rule.'
    }`,
    '',
    'Uploaded source files, internal identifiers and storage paths are not included.',
    '',
  ].join('\n');
}

/** Build the bundle and hand it to the browser. */
export async function downloadDesignSystemBundle(snapshot: DesignSystemSnapshot): Promise<void> {
  const files: Record<string, Uint8Array> = {
    '_ds_manifest.json': text(`${JSON.stringify(dsManifest(snapshot), null, 2)}\n`),
    'colors_and_type.css': text(`${renderDesignSystemStylesheet(snapshot)}\n`),
    'tokens.tokens.json': text(`${JSON.stringify(dtcgDocument(snapshot), null, 2)}\n`),
    '_adherence.oxlintrc.json': text(`${JSON.stringify(adherenceConfig(snapshot), null, 2)}\n`),
    // Internal keys are stripped before anything leaves the building — this bundle is
    // meant to be handed to a designer or another tool.
    'design-system.json': text(`${JSON.stringify(stripInternalKeys(snapshot), null, 2)}\n`),
    'README.md': text(readme(snapshot)),
  };
  for (const section of snapshot.sections) {
    files[`sections/${section.section}.md`] = text(sectionMarkdown(section));
  }

  const manifestEntries = await Promise.all(
    Object.entries(files).map(async ([path, bytes]) => ({
      path,
      size: bytes.byteLength,
      sha256: await sha256(bytes),
    })),
  );
  files['manifest.json'] = text(
    `${JSON.stringify(
      {
        format: 'continuum-design-system',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        brand: { name: snapshot.brandName },
        rigorTier: snapshot.rigor.override ?? snapshot.rigor.tier,
        files: manifestEntries,
      },
      null,
      2,
    )}\n`,
  );

  const archive = zipSync(files, { level: 6 });
  const slug =
    snapshot.brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'brand';

  const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slug}-design-system.zip`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
