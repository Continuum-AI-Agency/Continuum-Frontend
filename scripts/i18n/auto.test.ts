import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTranslator } from 'next-intl';
import { applyDrafts, planLocalization, runLocalization } from './auto.mjs';
import { reviewStatus } from './ci-status.mjs';
import { extractUi, jsxText } from './extract.mjs';
import { protectMessage } from './protect.mjs';
import { buildMessageScopes, lazyCatalogOutputs } from './scopes.mjs';

describe('offline message protection', () => {
  it('keeps nested plurals, tags and native number formats intact', () => {
    const source =
      '{count, plural, one {<b># file</b> for {name}} other {<b># files</b> for {name}}} · {amount, number, ::currency/USD}';
    const protectedMessage = protectMessage(source);
    const translated = protectedMessage.restore(
      protectedMessage.source.replaceAll(' file', ' arquivo').replaceAll(' for ', ' para '),
    );
    const t = createTranslator({ locale: 'pt-BR', messages: { files: translated } });
    expect(
      t.rich('files', { count: 2, name: 'João', amount: 5, b: (value) => `[${value}]` }),
    ).toContain('[2 arquivos] para João');
    expect(
      t.rich('files', { count: 2, name: 'João', amount: 5, b: (value) => `[${value}]` }),
    ).toContain('US$');
  });
  it('allows argument word order but rejects missing tokens and changed branches', () => {
    const protectedMessage = protectMessage('Send {name} to {place}');
    const tokens = protectedMessage.source.match(/CTI18N\d+TOKEN/g)!;
    expect(protectedMessage.restore(`Enviar para ${tokens[1]}: ${tokens[0]}`)).toBe(
      'Enviar para {place}: {name}',
    );
    expect(() => protectedMessage.restore('Lost the arguments')).toThrow('tokens');
    const source = '{count,plural,one {One file} other {Many files}}';
    const plural = protectMessage(source);
    const controls = plural.source.match(/CTI18N\d+TOKEN/g)!;
    expect(() =>
      plural.restore(
        plural.source.replace(controls[0], controls[1]).replace(controls[2], controls[0]),
      ),
    ).toThrow();
  });
  it('treats provider punctuation as literal ICU text', () => {
    const protectedMessage = protectMessage('Open {name}');
    const translated = protectedMessage.restore(
      protectedMessage.source.replace('Open', "Ouvrir l'archive {draft}"),
    );
    const t = createTranslator({ locale: 'fr', messages: { open: translated } });
    expect(t('open', { name: 'Acme' })).toBe("Ouvrir l'archive {draft} Acme");
  });
});

describe('safe React source extraction', () => {
  const catalogs = { common: { save: 'Save' }, scale: {} };
  it('retains directives, real JSX spacing and existing reviewed keys', () => {
    const result = extractUi(
      "'use client';export function Card(){return <p>Save <strong>draft</strong> now</p>}",
      'src/Card.tsx',
      catalogs,
    );
    expect(result.source.startsWith("'use client';")).toBe(true);
    expect(result.source).toContain('autoText("save")');
    expect(result.source).toContain('{autoText("save")} <strong>');
    expect(jsxText('\n Save\n ')).toBe('Save');
    expect(result.pending).toEqual([]);
  });
  it('uses server translations for async components and reuses earlier namespace hooks', () => {
    const server = extractUi(
      'export default async function Page(){return <h1>Save report</h1>}',
      'src/app/[locale]/page.tsx',
      catalogs,
    );
    expect(server.source).toContain('await getAutoTranslations("common")');
    expect(server.source).not.toContain('useAutoTranslations');
    const client = extractUi(
      "import {useTranslations as useCopy} from 'next-intl';function Card(){const t=useCopy('scale');return <button>Save report</button>}",
      'src/Card.tsx',
      catalogs,
    );
    expect(client.source).not.toContain('useAutoTranslations');
    expect(client.messages[0].namespace).toBe('scale');
  });
  it('leaves class methods, shared constants and templates with English branches for review', () => {
    for (const source of [
      'class Boundary {render(){return <p>Try again</p>}}',
      "const LABEL='Save report';function Card(){return <p>{LABEL}</p>}",
      'function Card(){return <p>{`${count}: ${ready?"Save":"Retry"}`}</p>}',
    ]) {
      const result = extractUi(source, 'src/Card.tsx', catalogs);
      expect(result.source).toBe(source);
      expect(result.pending.length).toBeGreaterThan(0);
    }
  });
  it('turns the ordinary count/singular/plural idiom into one ICU message', () => {
    const result = extractUi(
      'function Card(){return <p>{`${files.length} ${files.length===1?"file":"files"}`}</p>}',
      'src/Card.tsx',
      catalogs,
    );
    expect(result.messages[0].message).toBe('{count, plural, one {# file} other {# files}}');
    expect(result.source).toContain('{count: files.length}');
    expect(result.pending).toEqual([]);
  });
  it('never generates sparse memo dependencies', () => {
    const result = extractUi(
      'function Card(){const body=useMemo(()=> <p>Save report</p>,[value,]);return body}',
      'src/Card.tsx',
      catalogs,
    );
    expect(result.source).toContain('[value, autoText]');
    expect(result.source).not.toContain(',,');
  });
});

describe('incremental catalog filling', () => {
  it('preserves human edits alongside changed English, refreshes stale drafts and avoids repeat charges', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'i18n-auto-history-'));
    for (const directory of ['src', 'messages/common', 'scripts/i18n'])
      mkdirSync(path.join(root, directory), { recursive: true });
    const catalog = (locale: string, text: string) =>
      writeFileSync(
        path.join(root, `messages/common/${locale}.json`),
        JSON.stringify({ save: text }),
      );
    catalog('en', 'Save');
    catalog('pt-BR', 'Salvar');
    catalog('es', 'Guardar');
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    git('init', '--quiet');
    git('add', '.');
    git(
      '-c',
      'user.name=I18n test',
      '-c',
      'user.email=i18n-test@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'baseline',
    );
    catalog('en', 'Save draft');
    catalog('pt-BR', 'Salvar rascunho revisado');
    expect(planLocalization(root).jobs.map((job: { locale: string }) => job.locale)).toEqual([
      'es',
    ]);
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    writeFileSync(
      path.join(root, 'scripts/i18n/translation-drafts.json'),
      JSON.stringify({
        'common.save': {
          sourceHash: hash('Save draft'),
          targets: { es: hash('Guardar borrador') },
          reviewStatus: 'DRAFT',
        },
      }),
    );
    catalog('es', 'Guardar borrador');
    expect(planLocalization(root).jobs).toEqual([]);
    catalog('en', 'Save campaign');
    expect(planLocalization(root).jobs.map((job: { locale: string }) => job.locale)).toEqual([
      'es',
    ]);
  });
  it('checks existing catalogs before declaring a no-op current and refuses linked input trees', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'i18n-auto-check-'));
    const file = (name: string, text: string) => {
      const target = path.join(root, name);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    };
    file('src/i18n/catalogs.ts', "export const messageNamespaces=['common'] as const;");
    for (const [locale, message] of [
      ['en', 'Save {name}'],
      ['pt-BR', 'Salvar {name}'],
      ['es', 'Guardar {name}'],
    ]) {
      file(`messages/common/${locale}.json`, JSON.stringify({ save: message }));
      file(
        `src/i18n/emergency/${locale}.json`,
        JSON.stringify({
          error:
            locale === 'en'
              ? 'Something went wrong'
              : locale === 'es'
                ? 'Algo salió mal'
                : 'Algo deu errado',
        }),
      );
    }
    const manifest = buildMessageScopes(root);
    file('src/i18n/message-scopes.generated.json', JSON.stringify(manifest));
    for (const [name, content] of lazyCatalogOutputs(root, manifest)) file(name, content);
    expect(runLocalization({ project: root }).status).toBe('CURRENT');
    file('messages/common/es.json', JSON.stringify({ save: 'Guardar {other}' }));
    const result = runLocalization({ project: root });
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.errors.length).toBeGreaterThan(0);
    file('src/i18n/catalogs.ts', "export const messageNamespaces=['../../outside'] as const;");
    expect(() => buildMessageScopes(root)).toThrow('catalog directory names');
    const linkedRoot = mkdtempSync(path.join(tmpdir(), 'i18n-auto-linked-'));
    symlinkSync(path.join(root, 'messages'), path.join(linkedRoot, 'messages'));
    expect(() => planLocalization(linkedRoot)).toThrow('symlinks');
  });
  it('fills only missing locales, preserves reviewed text and stops on corrupt ICU', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'i18n-auto-test-'));
    for (const directory of ['src', 'messages/common', 'scripts/i18n'])
      mkdirSync(path.join(root, directory), { recursive: true });
    writeFileSync(
      path.join(root, 'messages/common/en.json'),
      JSON.stringify({ save: 'Save', hello: 'Hello {name}' }),
    );
    writeFileSync(
      path.join(root, 'messages/common/pt-BR.json'),
      JSON.stringify({ save: 'Salvar revisado' }),
    );
    writeFileSync(
      path.join(root, 'messages/common/es.json'),
      JSON.stringify({ save: 'Guardar revisado', hello: 'Hola {name}' }),
    );
    const plan = planLocalization(root, undefined);
    expect(plan.jobs.map((job: { locale: string; key: string }) => [job.locale, job.key])).toEqual([
      ['pt-BR', 'hello'],
    ]);
    const result = applyDrafts(plan, { 'pt-BR': { 'Hello {name}': 'Olá {name}' } });
    expect(result.catalogs.common['pt-BR'].save).toBe('Salvar revisado');
    expect(result.catalogs.common.es.hello).toBe('Hola {name}');
    expect(() => applyDrafts(plan, { 'pt-BR': { 'Hello {name}': 'Olá {renamed}' } })).toThrow(
      'structure',
    );
    expect(JSON.parse(readFileSync(path.join(root, 'messages/common/pt-BR.json'), 'utf8'))).toEqual(
      { save: 'Salvar revisado' },
    );
  });
});

describe('review automation boundaries', () => {
  it('keeps valid drafts while failing unresolved UI review and malformed catalogs', () => {
    const plan = { status: 'NEEDS_REVIEW', pending: [{ text: 'unresolved helper' }] };
    expect(reviewStatus(plan, null)).toEqual({ commit: false, passed: false, pending: 1 });
    const report = {
      status: 'NEEDS_REVIEW',
      errors: [],
      machineFindings: [],
      pending: plan.pending,
    };
    expect(reviewStatus(plan, report)).toEqual({ commit: true, passed: false, pending: 1 });
    expect(reviewStatus(plan, report, 1)).toEqual({ commit: false, passed: false, pending: 1 });
    expect(reviewStatus(plan, { ...report, errors: ['broken ICU'] })).toEqual({
      commit: false,
      passed: false,
      pending: 1,
    });
    expect(reviewStatus({ status: 'CURRENT', pending: [] }, null)).toEqual({
      commit: false,
      passed: true,
      pending: 0,
    });
  });
  it('pins trusted base code and restricts incoming repositories', () => {
    const workflow = Bun.YAML.parse(
      readFileSync(new URL('../../.github/workflows/i18n-auto.yml', import.meta.url), 'utf8'),
    ) as {
      on: { pull_request_target: { branches: string[] } };
      jobs: {
        drafts: { if: string; steps: Array<{ uses?: string; with?: Record<string, unknown> }> };
      };
    };
    expect(workflow.on.pull_request_target.branches).toEqual(['beta', 'main']);
    expect(workflow.jobs.drafts.if).toContain('head.repo.id == github.event.repository.id');
    const first = workflow.jobs.drafts.steps[0];
    expect(first.with?.path).toBe('tool');
    expect(first.with?.ref).toBe('${{ github.event.pull_request.base.sha }}');
    const source = readFileSync(
      new URL('../../.github/workflows/i18n-auto.yml', import.meta.url),
      'utf8',
    );
    expect(source).toContain('node tool/scripts/i18n/auto.mjs --write --project');
    expect(source).toContain('HEAD:refs/heads/$TARGET_BRANCH');
  });
});
