import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildMessageScopes, lazyCatalogOutputs } from './scopes.mjs';

const fixtures: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'i18n-scopes-test-'));
  fixtures.push(root);
  const file = (name: string, source: string) => {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
  };
  file(
    'src/i18n/catalogs.ts',
    "export const messageNamespaces = ['common','studio','organic'] as const;",
  );
  for (const locale of ['en', 'pt-BR', 'es']) {
    file(
      `messages/common/${locale}.json`,
      JSON.stringify({
        shell: `${locale} shell`,
        loading: `${locale} loading`,
        save: 'Unused common save',
      }),
    );
    file(
      `messages/studio/${locale}.json`,
      JSON.stringify({
        editor: `${locale} editor`,
        save: `${locale} save`,
        unused: 'Unrelated feature message',
      }),
    );
    file(
      `messages/organic/${locale}.json`,
      JSON.stringify({
        draftStatus_ready: `${locale} ready`,
        draftStatus_failed: `${locale} failed`,
        privateAction: 'Server-only message',
      }),
    );
  }
  file(
    'src/app/[locale]/layout.tsx',
    "import {FeatureMessages} from '@/i18n/FeatureMessages'; import Shell from '@/Shell'; export default function Layout({children}) {return <FeatureMessages><Shell/>{children}</FeatureMessages>}",
  );
  file(
    'src/i18n/FeatureMessages.tsx',
    'export function FeatureMessages({children}) {return children}',
  );
  file(
    'src/Shell.tsx',
    "'use client'; const t=useTranslations('common'); export default function Shell(){return <p>{t('shell')}</p>}",
  );
  file(
    'src/app/[locale]/page.tsx',
    "import EditorMessages from '@/EditorMessages'; export default function Page(){return <EditorMessages/>}",
  );
  file(
    'src/EditorMessages.tsx',
    "'use client'; import {LazyFeatureMessages} from '@/i18n/LazyFeatureMessages'; const preload=()=>import('./Editor'); const namespaces=['studio'] as const; export default function EditorMessages(){const t=useTranslations('common'); return <LazyFeatureMessages namespaces={namespaces} preload={preload} loading={t('loading')}><Editor/></LazyFeatureMessages>}",
  );
  file(
    'src/i18n/LazyFeatureMessages.tsx',
    "'use client'; export function LazyFeatureMessages({children}){return children}",
  );
  file(
    'src/Editor.tsx',
    "'use client'; import {statusLabel} from './status'; import {save} from './actions'; export default function Editor(){const t=useTranslations('studio'); return <p>{t('editor')}{t('save')}{statusLabel('ready')}</p>}",
  );
  file(
    'src/status.ts',
    "type T = ReturnType<typeof useTranslations<'organic'>>; export function statusLabel(status,translate:T){return translate(`draftStatus_${status}`)}",
  );
  file(
    'src/actions.ts',
    "'use server'; export async function save(){const t=await getTranslations('organic');return t('privateAction')}",
  );
  return root;
}

describe('source-derived client catalog boundaries', () => {
  it('keeps shell and loading messages eager while feature messages follow the lazy code boundary', () => {
    const root = fixture();
    const result = buildMessageScopes(root);
    expect(result.scopes['app/[locale]/layout.tsx']).toEqual({
      common: ['loading', 'shell'],
    });
    expect(result.lazyScopes['EditorMessages.tsx']).toEqual({
      common: ['loading'],
      organic: ['draftStatus_failed', 'draftStatus_ready'],
      studio: ['editor', 'save'],
    });
  });
  it('generates relevant active-language files without unrelated or server-action copy', () => {
    const root = fixture();
    const output = lazyCatalogOutputs(root, buildMessageScopes(root));
    const spanish = [...output].find(([file]) => file.endsWith('/es.json'));
    expect(spanish).toBeDefined();
    expect(JSON.parse(spanish![1])).toEqual({
      common: { loading: 'es loading' },
      organic: {
        draftStatus_failed: 'es failed',
        draftStatus_ready: 'es ready',
      },
      studio: { editor: 'es editor', save: 'es save' },
    });
    expect(spanish![1]).not.toContain('Server-only');
    expect(spanish![1]).not.toContain('Unused common');
    expect([...output.keys()].filter((file) => file.endsWith('.json'))).toHaveLength(3);
  });
});
