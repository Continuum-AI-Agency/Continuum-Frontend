// Every name any e2e file imports from the ledger module must be one ledger.ts exports. The
// Frontend typecheck excludes e2e/**, so a renamed export once reached beta and a spec died at
// runtime with `(0 , _ledger.brandObjectCount) is not a function` (f34, 2026-10-07). This reads
// the files, so the same break fails at `bun test` instead.
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const E2E = resolve(import.meta.dir, '..');
const LEDGER = join(import.meta.dir, 'ledger');

type Source = { path: string; text: string };

/** The names a module exports by declaration, values and types alike. */
function declaredExports(text: string): Set<string> {
  const declaration =
    /^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
  return new Set([...text.matchAll(declaration)].map((match) => match[1] ?? ''));
}

/** `file: symbol` for every name imported from the ledger module that it does not export. */
function missingLedgerImports(sources: readonly Source[], exported: Set<string>): string[] {
  // Statements only: an import written inside a string (a generated file, a fixture) is text.
  const named =
    /^\s*import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm;
  const missing: string[] = [];
  for (const { path, text } of sources) {
    for (const [, names = '', specifier = ''] of text.matchAll(named)) {
      if (!specifier.startsWith('.')) continue;
      if (resolve(dirname(path), specifier).replace(/\.ts$/, '') !== LEDGER) continue;
      for (const raw of names.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '').split(',')) {
        const name = raw
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (name && !exported.has(name)) missing.push(`${relative(E2E, path)}: ${name}`);
      }
    }
  }
  return missing;
}

function e2eSources(): Source[] {
  return readdirSync(E2E, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(m?ts|tsx)$/.test(file) && !file.includes('node_modules'))
    .map((file) => ({ path: join(E2E, file), text: readFileSync(join(E2E, file), 'utf8') }));
}

describe('ledger imports', () => {
  test('positive control: a planted missing name is reported by file and symbol', () => {
    const exported = new Set(['ownedStorage', 'removeAssets', 'OwnedObject']);
    const sources: Source[] = [
      {
        path: join(E2E, 'planted.spec.ts'),
        text: `import {
  ownedStorage,
  brandObjectCount, // gone
  removeAssets as remove,
  type OwnedObject,
} from './video-editor-workspace/ledger';
import { objectsFor } from './somewhere-else/ledger';`,
      },
      {
        path: join(E2E, 'support', 'nested.ts'),
        text: "import type { StorageRow } from '../video-editor-workspace/ledger.ts';",
      },
      {
        path: join(import.meta.dir, 'inside.test.ts'),
        text: "import { ownedStorage } from './ledger';",
      },
    ];
    expect(missingLedgerImports(sources, exported)).toEqual([
      'planted.spec.ts: brandObjectCount',
      'support/nested.ts: StorageRow',
    ]);
  });

  test('every e2e import of the ledger resolves to a ledger.ts export', () => {
    const sources = e2eSources();
    const exported = declaredExports(readFileSync(`${LEDGER}.ts`, 'utf8'));
    const importers = sources
      .filter((source) => missingLedgerImports([source], new Set()).length > 0)
      .map((source) => relative(E2E, source.path));
    // Not vacuous: the reader finds the importers it must find.
    expect(importers).toContain('video-editor-workspace.spec.ts');
    expect(importers).toContain('video-editor-workspace/ledger.test.ts');
    expect(missingLedgerImports(sources, exported)).toEqual([]);
  });
});
