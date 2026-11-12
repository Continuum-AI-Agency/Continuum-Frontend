import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createTranslator } from 'next-intl';
import { planLocalization, runLocalization } from './auto.mjs';
import { sealFile } from './seal.mjs';

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const staging =
  process.env.I18N_AUTOMATION_STAGING ?? `/tmp/continuum-i18n-automation-live-${runId}`;
const prefix = `gs://continuum-production-477821-creative-benchmarks/i18n/automation/live-${runId}/`;
const root = path.join(staging, 'fixture');
mkdirSync(root, { recursive: true, mode: 0o700 });
const file = (name, value) => {
  const destination = path.join(root, name);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(
    destination,
    typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n',
    { flag: 'wx' },
  );
};
file('src/i18n/catalogs.ts', "export const messageNamespaces = ['common'] as const;");
file(
  'src/Phrase.tsx',
  "'use client';import {useTranslations} from 'next-intl';export function Phrase(){const t=useTranslations('common');return <p>Save a campaign draft</p>}",
);
file('scripts/i18n/literal-exceptions.json', []);
const count = '{count,plural,one {# campaign draft} other {# campaign drafts}} for {name}';
for (const locale of ['en', 'pt-BR', 'es']) {
  file(
    `messages/common/${locale}.json`,
    locale === 'en' ? { reviewed: 'Continuum', count } : { reviewed: 'Continuum' },
  );
  file(`src/i18n/emergency/${locale}.json`, {
    error:
      locale === 'en'
        ? 'Something went wrong'
        : locale === 'pt-BR'
          ? 'Algo deu errado'
          : 'Algo salió mal',
  });
}
console.log(
  JSON.stringify({
    owner: 'Claighmor/i18n',
    prefix,
    staging,
    budgetBytes: 2 * 1024 ** 3,
    kind: 'bounded text-only provider round trip; no app build or performance measurement',
  }),
);
const result = runLocalization({
  project: root,
  write: true,
  staging: path.join(staging, 'drafts'),
  prefix,
  maxCharacters: 4000,
});
assert.equal(result.status, 'SOURCE_CHECKS_PASS');
assert.equal(result.missingOrChangedTargets, 4);
assert.equal(result.reviewStatus, 'DRAFT');
const source = readFileSync(path.join(root, 'src/Phrase.tsx'), 'utf8');
assert.match(source, /t\("auto_/);
assert.ok(!source.includes('Save a campaign draft'));
for (const locale of ['pt-BR', 'es']) {
  const messages = JSON.parse(
    readFileSync(path.join(root, `messages/common/${locale}.json`), 'utf8'),
  );
  assert.equal(messages.reviewed, 'Continuum');
  assert.notEqual(messages.count, count);
  const t = createTranslator({
    locale,
    messages,
    onError: (error) => {
      throw error;
    },
  });
  const rendered = t('count', { count: 2, name: 'Acme' });
  assert.ok(rendered.includes('2') && rendered.includes('Acme'));
  assert.ok(!rendered.includes('campaign drafts'));
}
const again = planLocalization(root);
assert.equal(again.jobs.length, 0);
assert.equal(again.sourceEdits.length, 0);
assert.equal(again.pending.length, 0);
writeFileSync(
  path.join(staging, 'acceptance.json'),
  JSON.stringify(
    {
      status: 'PASS',
      realCloudTranslation: true,
      realCatalogWrites: true,
      realIcuRendering: true,
      repeatRunPaidRequests: 0,
      productionBuilds: 0,
      reviewStatus: 'DRAFT',
      prefix,
      result,
    },
    null,
    2,
  ) + '\n',
);
sealFile(path.join(staging, 'acceptance.json'), `${prefix}acceptance.json`);
console.log(
  'PASS: real provider → validated catalogs → ICU rendering; repeat run has zero translation requests; no production build.',
);
