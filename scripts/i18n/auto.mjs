import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, validateCatalogs } from './check.mjs';
import { extractUi } from './extract.mjs';
import { assertSameMessageStructure, protectMessage } from './protect.mjs';
import { buildMessageScopes, lazyCatalogOutputs } from './scopes.mjs';
import { sealFile } from './seal.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const locales = ['pt-BR', 'es'];
const hash = (text) => createHash('sha256').update(text).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = (file, fallback) => {
  if (!existsSync(file)) return fallback;
  if (lstatSync(file).isSymbolicLink()) throw new Error(`Catalog symlinks require review: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
};

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Source symlinks require review: ${file}`);
    if (entry.isDirectory())
      return /^(?:__tests__|__fixtures__|__eval__|dev-preview)$/.test(entry.name)
        ? []
        : sourceFiles(file);
    return /\.tsx?$/.test(file) && !/\.(?:test|spec|stories|dev)\.|\.d\.ts$/.test(file)
      ? [file]
      : [];
  });
}

function assertDataPaths(root) {
  const inspect = (file, recursive = false) => {
    if (!existsSync(file)) return;
    if (lstatSync(file).isSymbolicLink())
      throw new Error(`Localization input symlinks require review: ${file}`);
    if (recursive && lstatSync(file).isDirectory())
      for (const entry of readdirSync(file)) inspect(path.join(file, entry), true);
  };
  // A privileged PR job reads this tree as data; ancestor links must not escape it.
  for (const directory of ['src', 'messages']) inspect(path.join(root, directory), true);
  for (const file of [
    'scripts',
    'scripts/i18n',
    'scripts/i18n/literal-exceptions.json',
    'scripts/i18n/translation-drafts.json',
  ])
    inspect(path.join(root, file));
}

function previousCatalog(root, base, file) {
  if (!base) return {};
  if (!/^[\w/.-]+$/.test(base) || base.startsWith('-'))
    throw new Error('Invalid baseline revision');
  const result = spawnSync('git', ['show', `${base}:${file}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) return {};
  return JSON.parse(result.stdout);
}

export function planLocalization(root = project, base = 'HEAD') {
  assertDataPaths(root);
  const catalogs = {};
  for (const entry of readdirSync(path.join(root, 'messages'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('client-')) continue;
    catalogs[entry.name] = Object.fromEntries(
      ['en', ...locales].map((locale) => [
        locale,
        readJson(path.join(root, 'messages', entry.name, `${locale}.json`), {}),
      ]),
    );
  }
  const english = Object.fromEntries(
    Object.entries(catalogs).map(([namespace, messages]) => [namespace, { ...messages.en }]),
  );
  const exceptions = readJson(path.join(root, 'scripts/i18n/literal-exceptions.json'), []);
  const sourceEdits = [];
  const pending = [];
  for (const file of sourceFiles(path.join(root, 'src'))) {
    const relative = path.relative(root, file);
    const before = readFileSync(file, 'utf8');
    const extracted = extractUi(before, relative, english, exceptions);
    pending.push(...extracted.pending);
    if (extracted.source !== before)
      sourceEdits.push({ file: relative, before, after: extracted.source });
    for (const message of extracted.messages)
      english[message.namespace][message.key] = message.message;
  }
  const state = readJson(path.join(root, 'scripts/i18n/translation-drafts.json'), {});
  const jobs = [];
  for (const [namespace, messages] of Object.entries(english)) {
    const oldEnglish = previousCatalog(root, base, `messages/${namespace}/en.json`);
    const oldTargets = Object.fromEntries(
      locales.map((locale) => [
        locale,
        previousCatalog(root, base, `messages/${namespace}/${locale}.json`),
      ]),
    );
    for (const [key, source] of Object.entries(messages)) {
      if (typeof source !== 'string')
        throw new Error(`Nested catalog keys require review: ${namespace}.${key}`);
      const sourceHash = hash(source);
      const saved = state[`${namespace}.${key}`];
      for (const locale of locales) {
        const current = catalogs[namespace][locale][key];
        const changed = typeof oldEnglish[key] === 'string' && oldEnglish[key] !== source;
        const alreadyDrafted =
          saved?.sourceHash === sourceHash && saved.targets?.[locale] === hash(current ?? '');
        const previousDraft = saved?.targets?.[locale] === hash(current ?? '');
        const manuallyTranslated =
          changed &&
          typeof current === 'string' &&
          current.trim() &&
          current !== oldTargets[locale][key] &&
          !previousDraft;
        if (manuallyTranslated) continue;
        if (
          (typeof current !== 'string' || !current.trim() || changed) &&
          !(alreadyDrafted && typeof current === 'string' && current.trim())
        )
          jobs.push({ namespace, key, source, sourceHash, locale });
      }
    }
  }
  return { root, catalogs, english, sourceEdits, pending, state, jobs };
}

export function applyDrafts(plan, drafts) {
  const catalogs = structuredClone(plan.catalogs);
  const state = structuredClone(plan.state);
  for (const [namespace, english] of Object.entries(plan.english)) catalogs[namespace].en = english;
  for (const job of plan.jobs) {
    const translated = drafts[job.locale]?.[job.source];
    if (typeof translated !== 'string')
      throw new Error(`Missing draft: ${job.locale} ${job.namespace}.${job.key}`);
    // This also rejects syntax/argument changes from a provider or an edited draft file.
    assertSameMessageStructure(job.source, translated);
    const entry = state[`${job.namespace}.${job.key}`] ?? {
      sourceHash: job.sourceHash,
      targets: {},
      reviewStatus: 'DRAFT',
    };
    if (entry.sourceHash !== job.sourceHash) entry.targets = {};
    entry.sourceHash = job.sourceHash;
    entry.reviewStatus = 'DRAFT';
    entry.targets[job.locale] = hash(translated);
    state[`${job.namespace}.${job.key}`] = entry;
    catalogs[job.namespace][job.locale][job.key] = translated;
  }
  for (const [namespace, messages] of Object.entries(catalogs)) {
    const failures = validateCatalogs(messages);
    if (failures.length) throw new Error(`${namespace}: ${failures.join('; ')}`);
  }
  return { catalogs, state };
}

function atomicWrite(file, text) {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return;
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, text, { flag: 'wx' });
  renameSync(temporary, file);
}

function writeCatalog(file, catalog) {
  const previous = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const indent = previous.match(/\n([ \t]+)"/)?.[1] ?? '  ';
  atomicWrite(file, `${JSON.stringify(catalog, null, indent)}\n`);
}

function guardStorage(staging) {
  const usage = (directory) =>
    readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
      const file = path.join(directory, entry.name);
      return total + (entry.isDirectory() ? usage(file) : entry.isFile() ? statSync(file).size : 0);
    }, 0);
  const disk = statfsSync(staging);
  if (disk.bavail * disk.bsize < 20 * 1024 ** 3 || usage(staging) > 2 * 1024 ** 3)
    throw new Error('Storage guard stopped localization; all files retained');
}

export function runLocalization(options = {}) {
  const root = path.resolve(options.project ?? project);
  const plan = planLocalization(root, options.base ?? 'HEAD');
  const summary = {
    sourceFiles: plan.sourceEdits.length,
    missingOrChangedTargets: plan.jobs.length,
    pending: plan.pending,
  };
  if (!options.write) {
    const checked = plan.jobs.length || plan.sourceEdits.length ? null : check(root);
    return {
      ...summary,
      mode: 'CHECK',
      errors: checked?.errors ?? [],
      machineFindings: checked?.machineFindings ?? [],
      status:
        plan.jobs.length || plan.sourceEdits.length || plan.pending.length
          ? 'NEEDS_TRANSLATION'
          : checked.errors.length || checked.findings.length || checked.machineFindings.length
            ? 'NEEDS_REVIEW'
            : 'CURRENT',
    };
  }
  const runId =
    options.runId ??
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  if (!/^[\w.-]+$/.test(runId)) throw new Error('Invalid run ID');
  const staging = path.resolve(options.staging ?? `/tmp/continuum-i18n-automation-${runId}`);
  const prefix =
    options.prefix ??
    `gs://continuum-production-477821-creative-benchmarks/i18n/automation/${runId}/`;
  if (!prefix.startsWith('gs://continuum-production-477821-creative-benchmarks/i18n/'))
    throw new Error('Use the approved i18n evidence prefix');
  if (existsSync(staging)) throw new Error('Use a fresh staging directory; no implicit paid retry');
  mkdirSync(staging, { recursive: true, mode: 0o700 });
  guardStorage(staging);
  console.log(`owner=Claighmor/i18n staging=${staging} prefix=${prefix} budget=2GiB`);
  atomicWrite(
    path.join(staging, 'plan.json'),
    json({ ...summary, jobs: plan.jobs, base: options.base ?? 'HEAD' }),
  );
  sealFile(path.join(staging, 'plan.json'), `${prefix.replace(/\/$/, '')}/plan.json`);
  const drafts = {};
  let sourceCharacters = 0;
  for (const locale of locales) {
    const sources = [
      ...new Set(plan.jobs.filter((job) => job.locale === locale).map((job) => job.source)),
    ];
    if (!sources.length) continue;
    const protectedMessages = new Map(sources.map((source) => [source, protectMessage(source)]));
    sourceCharacters += [...protectedMessages.values()].reduce(
      (total, message) => total + [...message.source].length,
      0,
    );
    if (sourceCharacters > (options.maxCharacters ?? 10_000))
      throw new Error(
        'Translation request budget exceeded; split the change before a paid request',
      );
    drafts[locale] = { protectedMessages };
  }
  // Admit the complete request before issuing any paid call.
  for (const locale of locales) {
    if (!drafts[locale]) continue;
    guardStorage(staging);
    const protectedMessages = drafts[locale].protectedMessages;
    const input = path.join(staging, `${locale}-input.json`);
    atomicWrite(input, json([...protectedMessages.values()].map((message) => message.source)));
    const result = spawnSync(
      'python3',
      [
        path.join(project, 'scripts/i18n/google-drafts.py'),
        '--locale',
        locale,
        '--input',
        input,
        '--staging',
        path.join(staging, locale),
        '--prefix',
        `${prefix.replace(/\/$/, '')}/${locale}/`,
        '--max-source-characters',
        String(options.maxCharacters ?? 10_000),
      ],
      { stdio: 'inherit', timeout: 180_000 },
    );
    if (result.error || result.status !== 0)
      throw new Error(
        `Offline drafts failed (${locale}); retain staging and inspect sealed requests before an explicit retry`,
      );
    const response = readJson(path.join(staging, locale, 'drafts.json'), {});
    drafts[locale] = Object.fromEntries(
      [...protectedMessages].map(([source, message]) => [
        source,
        message.restore(response[message.source]?.[locale]),
      ]),
    );
  }
  const { catalogs, state } = applyDrafts(plan, drafts);
  for (const edit of plan.sourceEdits)
    if (readFileSync(path.join(root, edit.file), 'utf8') !== edit.before)
      throw new Error('Source changed during translation; catalogs were not applied');
  for (const [namespace, messages] of Object.entries(plan.catalogs))
    for (const locale of ['en', ...locales])
      if (
        JSON.stringify(readJson(path.join(root, 'messages', namespace, `${locale}.json`), {})) !==
        JSON.stringify(messages[locale])
      )
        throw new Error('Catalog changed during translation; drafts retained');
  if (
    JSON.stringify(readJson(path.join(root, 'scripts/i18n/translation-drafts.json'), {})) !==
    JSON.stringify(plan.state)
  )
    throw new Error('Review state changed during translation; drafts retained');
  for (const [namespace, messages] of Object.entries(catalogs))
    for (const [locale, catalog] of Object.entries(messages))
      if (JSON.stringify(catalog) !== JSON.stringify(plan.catalogs[namespace][locale]))
        writeCatalog(path.join(root, 'messages', namespace, `${locale}.json`), catalog);
  for (const edit of plan.sourceEdits) atomicWrite(path.join(root, edit.file), edit.after);
  if (plan.jobs.length)
    atomicWrite(path.join(root, 'scripts/i18n/translation-drafts.json'), json(state));
  const manifest = buildMessageScopes(root);
  atomicWrite(path.join(root, 'src/i18n/message-scopes.generated.json'), json(manifest));
  for (const [file, content] of lazyCatalogOutputs(root, manifest))
    atomicWrite(path.join(root, file), content);
  const checked = check(root);
  const pending = [
    ...new Map(
      [...plan.pending, ...checked.findings].map((item) => [JSON.stringify(item), item]),
    ).values(),
  ];
  const report = {
    ...summary,
    sourceCharacters,
    mode: 'WRITE',
    reviewStatus: plan.jobs.length ? 'DRAFT' : 'UNCHANGED',
    status:
      checked.errors.length || pending.length || checked.machineFindings.length
        ? 'NEEDS_REVIEW'
        : 'SOURCE_CHECKS_PASS',
    errors: checked.errors,
    pending,
    machineFindings: checked.machineFindings,
    prefix,
    staging,
  };
  atomicWrite(path.join(staging, 'report.json'), json(report));
  guardStorage(staging);
  sealFile(path.join(staging, 'report.json'), `${prefix.replace(/\/$/, '')}/report.json`);
  console.log(json(report));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    const flags = new Map([
      ['--project', 'project'],
      ['--base', 'base'],
      ['--staging', 'staging'],
      ['--prefix', 'prefix'],
      ['--run-id', 'runId'],
      ['--max-characters', 'maxCharacters'],
    ]);
    for (let index = 2; index < process.argv.length; index++) {
      const argument = process.argv[index];
      if (argument === '--write') options.write = true;
      else if (argument === '--check') options.write = false;
      else if (flags.has(argument) && process.argv[index + 1])
        options[flags.get(argument)] =
          argument === '--max-characters' ? Number(process.argv[++index]) : process.argv[++index];
      else throw new Error(`Unknown or incomplete option: ${argument}`);
    }
    if (
      options.maxCharacters !== undefined &&
      (!Number.isInteger(options.maxCharacters) ||
        options.maxCharacters < 1 ||
        options.maxCharacters > 100_000)
    )
      throw new Error('Request budget must be 1–100000 codepoints');
    const result = runLocalization(options);
    if (!options.write) console.log(json(result));
    process.exitCode = ['CURRENT', 'SOURCE_CHECKS_PASS'].includes(result.status) ? 0 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
