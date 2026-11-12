import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

function walk(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') return;
  visitor(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visitor, node));
    else walk(value, visitor, node);
  }
}

function unwrap(node) {
  return ['TSAsExpression', 'TSSatisfiesExpression', 'ParenthesizedExpression'].includes(node?.type)
    ? unwrap(node.expression)
    : node;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory())
      return /^(?:__tests__|__eval__|__fixtures__|dev-preview)$/.test(entry.name)
        ? []
        : sourceFiles(file);
    return /\.[jt]sx?$/.test(file) &&
      !/\.(?:test|spec|stories|dev)\./.test(file) &&
      !file.endsWith('.d.ts')
      ? [file]
      : [];
  });
}

function catalogKeys(catalog, prefix = '') {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [name] : catalogKeys(value, name);
  });
}

export function buildMessageScopes(projectDirectory) {
  const sourceRoot = path.join(projectDirectory, 'src');
  const files = sourceFiles(sourceRoot);
  const knownFiles = new Set(files);
  const modules = new Map();
  const keyNamespaces = new Map();
  const registry = parse(readFileSync(path.join(sourceRoot, 'i18n/catalogs.ts'), 'utf8'), {
    sourceType: 'module',
    plugins: ['typescript'],
  });
  let namespaces = [];
  walk(registry, (node) => {
    if (node.type === 'VariableDeclarator' && node.id.name === 'messageNamespaces') {
      namespaces = unwrap(node.init).elements.map((item) => item.value);
    }
  });
  if (!namespaces.length) throw new Error('The canonical message namespace registry is missing');
  if (
    namespaces.some(
      (namespace) => typeof namespace !== 'string' || !/^[a-z][a-z0-9-]*$/.test(namespace),
    )
  )
    throw new Error('Message namespaces must be catalog directory names');
  for (const namespace of namespaces) {
    const keys = catalogKeys(
      JSON.parse(
        readFileSync(path.join(projectDirectory, 'messages', namespace, 'en.json'), 'utf8'),
      ),
    );
    for (const key of keys) {
      if (!keyNamespaces.has(key)) keyNamespaces.set(key, []);
      keyNamespaces.get(key).push(namespace);
    }
  }
  function resolve(from, specifier) {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
    const base = specifier.startsWith('@/')
      ? path.join(sourceRoot, specifier.slice(2))
      : path.resolve(path.dirname(from), specifier);
    return (
      [
        base,
        ...['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'].map(
          (extension) => base + extension,
        ),
      ].find((file) => knownFiles.has(file)) ?? null
    );
  }
  function info(file) {
    if (modules.has(file)) return modules.get(file);
    const ast = parse(readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
    for (const statement of ast.program.body) {
      if (
        statement.type === 'ExpressionStatement' &&
        statement.expression.type === 'StringLiteral' &&
        ['use client', 'use server'].includes(statement.expression.value)
      )
        throw new Error(
          `${file}:${statement.loc.start.line}: ${statement.expression.value} directive must precede imports`,
        );
    }
    const result = {
      client: ast.program.directives.some((directive) => directive.value.value === 'use client'),
      serverAction: ast.program.directives.some(
        (directive) => directive.value.value === 'use server',
      ),
      imports: new Set(),
      keys: new Map(),
      provider: false,
      lazyNamespaces: new Set(),
    };
    const constants = new Map();
    const moduleNamespaces = new Set();
    const translationFactories = new Set(['useTranslations', 'getTranslations']);
    const translators = new Set(['t', 'uiText', 'translate', 'translateUi', 'tUi']);
    for (const node of ast.program.body)
      if (
        node.type === 'ImportDeclaration' &&
        ['next-intl', 'next-intl/server'].includes(node.source.value)
      ) {
        for (const specifier of node.specifiers)
          if (['useTranslations', 'getTranslations'].includes(specifier.imported?.name))
            translationFactories.add(specifier.local.name);
      }
    walk(ast, (node) => {
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier')
        constants.set(node.id.name, unwrap(node.init));
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
        const call = node.init?.type === 'AwaitExpression' ? node.init.argument : node.init;
        if (call?.type === 'CallExpression' && translationFactories.has(call.callee.name))
          translators.add(node.id.name);
      }
      if (node.type === 'CallExpression' && translationFactories.has(node.callee.name)) {
        const argument = node.arguments[0];
        const namespace =
          argument?.type === 'StringLiteral'
            ? argument.value
            : argument?.type === 'ObjectExpression'
              ? argument.properties.find((property) => property.key?.name === 'namespace')?.value
                  ?.value
              : undefined;
        if (namespaces.includes(namespace)) moduleNamespaces.add(namespace);
      }
      if (node.type === 'TSTypeQuery' && translationFactories.has(node.exprName?.name)) {
        const namespace = node.typeParameters?.params[0]?.literal?.value;
        if (namespaces.includes(namespace)) moduleNamespaces.add(namespace);
      }
    });
    const runtimeExports = ast.program.body.filter(
      (node) =>
        node.type === 'ExportDefaultDeclaration' ||
        (node.type === 'ExportNamedDeclaration' &&
          node.exportKind !== 'type' &&
          node.declaration &&
          !/^TS(?:Interface|TypeAlias)/.test(node.declaration.type)),
    );
    const exported =
      runtimeExports.length === 1 && runtimeExports[0].type === 'ExportDefaultDeclaration'
        ? runtimeExports[0].declaration
        : null;
    const topReturn = exported?.body?.body?.find((node) => node.type === 'ReturnStatement');
    const lazy = unwrap(topReturn?.argument);
    if (lazy?.type === 'JSXElement' && lazy.openingElement.name.name === 'LazyFeatureMessages') {
      const value = lazy.openingElement.attributes.find(
        (attribute) => attribute.name?.name === 'namespaces',
      )?.value?.expression;
      const array = value?.type === 'Identifier' ? constants.get(value.name) : unwrap(value);
      if (array?.type === 'ArrayExpression')
        for (const item of array.elements)
          if (item?.type === 'StringLiteral') result.lazyNamespaces.add(item.value);
    }
    walk(ast, (node, parent) => {
      if (node.type === 'JSXOpeningElement' && node.name.name === 'FeatureMessages')
        result.provider = true;
      const translatedTemplate =
        ['CallExpression', 'OptionalCallExpression'].includes(parent?.type) &&
        parent.arguments[0] === node &&
        (translators.has(parent.callee.name) ||
          (['MemberExpression', 'OptionalMemberExpression'].includes(parent.callee.type) &&
            ['ui', 'ctx'].includes(parent.callee.object.name) &&
            ['t', 'translate'].includes(parent.callee.property.name)));
      if (
        node.type === 'TemplateLiteral' &&
        translatedTemplate &&
        node.quasis.some((part) => part.value.cooked)
      ) {
        const pattern = new RegExp(
          '^' +
            node.quasis
              .map((part) => (part.value.cooked ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('.*') +
            '$',
        );
        for (const [key, candidates] of keyNamespaces)
          if (pattern.test(key)) {
            for (const namespace of candidates) {
              if (moduleNamespaces.size && !moduleNamespaces.has(namespace)) continue;
              if (!result.keys.has(namespace)) result.keys.set(namespace, new Set());
              result.keys.get(namespace).add(key);
            }
          }
      }
      if (node.type === 'StringLiteral' && keyNamespaces.has(node.value)) {
        for (const namespace of keyNamespaces.get(node.value)) {
          if (moduleNamespaces.size && !moduleNamespaces.has(namespace)) continue;
          if (!result.keys.has(namespace)) result.keys.set(namespace, new Set());
          result.keys.get(namespace).add(node.value);
        }
      }
      if (
        ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(
          node.type,
        ) &&
        node.source &&
        node.importKind !== 'type' &&
        node.exportKind !== 'type' &&
        !(
          node.type === 'ImportDeclaration' &&
          node.specifiers.length &&
          node.specifiers.every((item) => item.importKind === 'type')
        )
      ) {
        const target = resolve(file, node.source.value);
        if (target) result.imports.add(target);
      }
      if (
        node.type === 'CallExpression' &&
        (node.callee.type === 'Import' || node.callee.name === 'require')
      ) {
        const argument = node.arguments[0];
        if (argument?.type === 'StringLiteral') {
          const target = resolve(file, argument.value);
          if (target) result.imports.add(target);
        } else if (argument?.type === 'TemplateLiteral') {
          const prefix = argument.quasis[0]?.value.cooked;
          if (prefix?.startsWith('.') || prefix?.startsWith('@/')) {
            const absolute = prefix.startsWith('@/')
              ? path.join(sourceRoot, prefix.slice(2))
              : path.resolve(path.dirname(file), prefix);
            for (const target of files) if (target.startsWith(absolute)) result.imports.add(target);
          }
        }
      }
    });
    modules.set(file, result);
    return result;
  }
  const appRoot = path.join(sourceRoot, 'app/[locale]');
  const appFiles = files.filter((file) => file.startsWith(`${appRoot}/`));
  const providers = appFiles.filter((file) => info(file).provider);
  const layouts = providers.filter((file) => path.basename(file) === 'layout.tsx');
  const boundaries = appFiles.filter((file) =>
    /\/(?:page|layout|template|loading|error|not-found)\.[jt]sx?$/.test(file),
  );
  function ancestors(file) {
    const result = [];
    let directory = path.dirname(file);
    while (directory.startsWith(appRoot)) {
      const layout = path.join(directory, 'layout.tsx');
      if (knownFiles.has(layout) && layout !== file) result.push(layout);
      directory = path.dirname(directory);
    }
    return result;
  }
  const scopes = {};
  const lazyBoundaries = new Set();
  function collect(seeds, rootLazy = null) {
    const visited = new Set();
    const keys = new Map();
    const queue = seeds;
    while (queue.length) {
      const [file, inheritedClient] = queue.pop();
      const module = info(file);
      const client = inheritedClient || module.client;
      const identity = `${file}:${client}`;
      if (visited.has(identity)) continue;
      visited.add(identity);
      if (client && module.serverAction) continue;
      if (client)
        for (const [namespace, names] of module.keys) {
          if (file !== rootLazy && module.lazyNamespaces.has(namespace)) continue;
          if (!keys.has(namespace)) keys.set(namespace, new Set());
          for (const name of names) keys.get(namespace).add(name);
        }
      if (client && module.lazyNamespaces.size && file !== rootLazy) {
        lazyBoundaries.add(path.relative(sourceRoot, file));
        continue;
      }
      for (const dependency of module.imports) queue.push([dependency, client]);
    }
    return Object.fromEntries(
      [...keys]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([namespace, names]) => [namespace, [...names].sort()]),
    );
  }
  for (const provider of providers) {
    const seeds = [provider, ...ancestors(provider)];
    if (path.basename(provider) === 'layout.tsx') {
      for (const boundary of boundaries) {
        if (layouts.includes(boundary) || providers.includes(boundary)) continue;
        const nearest = layouts
          .filter((layout) => boundary.startsWith(`${path.dirname(layout)}/`))
          .sort((a, b) => b.length - a.length)[0];
        if (nearest === provider) seeds.push(boundary);
      }
    }
    scopes[path.relative(sourceRoot, provider)] = collect(seeds.map((file) => [file, false]));
  }
  const lazyScopes = {};
  // Visiting a boundary can discover another lazy boundary; resolve each once.
  for (const relative of lazyBoundaries) {
    const file = path.join(sourceRoot, relative);
    lazyScopes[relative] = collect([[file, true]], file);
  }
  return {
    scopes,
    lazyScopes: Object.fromEntries(
      Object.entries(lazyScopes).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

export function lazyCatalogOutputs(projectDirectory, manifest) {
  const output = new Map();
  const loaders = [];
  for (const [scope, namespaces] of Object.entries(manifest.lazyScopes)) {
    const name = `client-${createHash('sha256').update(scope).digest('hex').slice(0, 12)}`;
    const entries = [];
    for (const locale of ['en', 'pt-BR', 'es']) {
      const messages = {};
      for (const [namespace, keys] of Object.entries(namespaces)) {
        const source = JSON.parse(
          readFileSync(
            path.join(projectDirectory, 'messages', namespace, `${locale}.json`),
            'utf8',
          ),
        );
        messages[namespace] = {};
        for (const key of keys) {
          const parts = key.split('.');
          let value = source;
          for (const part of parts) value = value?.[part];
          if (typeof value !== 'string')
            throw new Error(`Missing lazy message ${scope}: ${namespace}.${key}`);
          let target = messages[namespace];
          for (const part of parts.slice(0, -1)) target = target[part] ??= {};
          target[parts.at(-1)] = value;
        }
      }
      const file = `messages/${name}/${locale}.json`;
      output.set(file, JSON.stringify(messages, null, 2) + '\n');
      entries.push(
        `    ${JSON.stringify(locale)}: () => import(${JSON.stringify(`../../${file}`)}),`,
      );
    }
    loaders.push(`  ${JSON.stringify(scope)}: {\n${entries.join('\n')}\n  },`);
  }
  output.set(
    'src/i18n/lazy-catalogs.generated.ts',
    '// Generated by i18n:sync from production imports. Edit the canonical catalogs.\nexport const lazyCatalogLoaders = {\n' +
      loaders.join('\n') +
      '\n} as const;\n',
  );
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const manifest = buildMessageScopes(project);
  const generated = JSON.stringify(manifest, null, 2) + '\n';
  const destination = path.join(project, 'src/i18n/message-scopes.generated.json');
  if (process.argv.includes('--write')) {
    writeFileSync(destination, generated);
    for (const [file, content] of lazyCatalogOutputs(project, manifest)) {
      const absolute = path.join(project, file);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
    }
    console.log('Updated source-derived client message scopes');
  } else if (
    !existsSync(destination) ||
    readFileSync(destination, 'utf8') !== generated ||
    [...lazyCatalogOutputs(project, manifest)].some(
      ([file, content]) =>
        !existsSync(path.join(project, file)) ||
        readFileSync(path.join(project, file), 'utf8') !== content,
    )
  ) {
    console.error('Client message scopes are stale. Run bun run i18n:sync.');
    process.exitCode = 1;
  } else console.log('Client message scopes match current production imports');
}
