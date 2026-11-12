import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import compile from 'icu-minify/compile';
import { buildMessageScopes, lazyCatalogOutputs } from './scopes.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const locales = ['en', 'pt-BR', 'es'];
const properNames = new Set([
  'Continuum',
  'Continuum AI',
  'Jaina',
  'Forge',
  'Meta',
  'Instagram',
  'Facebook',
  'TikTok',
  'YouTube',
  'Google',
  'Google Ads',
  'LinkedIn',
  'WhatsApp',
  'Slack',
  'Notion',
  'Canva',
  'Figma',
  'After Effects',
  'AI',
  'API',
  'CSV',
  'PDF',
  'JSON',
  'HTML',
  'URL',
  'PNG',
  'JPG',
  'JPEG',
  'GIF',
  'SVG',
  'MP4',
  'MOV',
  'ROAS',
  'CPA',
  'CPC',
  'CPM',
  'CTR',
  'USD',
  'BRL',
  'MXN',
  'EUR',
  'X',
  'MCP',
  'OpenAI',
  'Claude',
  'Cursor',
  'GitHub',
  'Scira AI',
  'sk-...',
  'Organic +',
  'Performance +',
  'Creative +',
]);

function flatten(value, prefix = '', result = {}) {
  for (const [key, message] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw new Error(`Reserved message key: ${key}`);
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof message === 'string') result[name] = message;
    else if (message && typeof message === 'object' && !Array.isArray(message))
      flatten(message, name, result);
    else throw new Error(`Message ${name} must be a string or namespace`);
  }
  return result;
}

export function messageArguments(message) {
  const names = new Set();
  function visitNode(node) {
    if (!Array.isArray(node)) return;
    names.add(node[0]);
    if (typeof node[1] === 'number' && node[1] !== 0) {
      if ([1, 2, 3].includes(node[1])) Object.values(node[2]).forEach(visitMessage);
    } else node.slice(1).forEach(visitNode);
  }
  function visitMessage(value) {
    if (Array.isArray(value)) value.forEach(visitNode);
  }
  visitMessage(compile(message));
  return [...names].sort();
}

export function messageArgumentKinds(message) {
  const kinds = {};
  function node(value) {
    if (!Array.isArray(value)) return;
    kinds[value[0]] =
      value.length > 1 && (typeof value[1] !== 'number' || value[1] === 0) ? 'tag' : 'value';
    if (typeof value[1] === 'number' && value[1] !== 0) {
      if ([1, 2, 3].includes(value[1])) Object.values(value[2]).forEach(body);
    } else value.slice(1).forEach(node);
  }
  function body(value) {
    if (Array.isArray(value)) value.forEach(node);
  }
  body(compile(message));
  return Object.fromEntries(Object.entries(kinds).sort(([a], [b]) => a.localeCompare(b)));
}

export function validateCatalogs(catalogs) {
  const failures = [];
  let source;
  try {
    source = flatten(catalogs.en);
  } catch (error) {
    return [String(error)];
  }
  if (!Object.keys(source).length) failures.push('English catalog is empty');
  for (const locale of locales) {
    let translated;
    try {
      translated = flatten(catalogs[locale]);
    } catch (error) {
      failures.push(`${locale}: ${error}`);
      continue;
    }
    const sourceKeys = Object.keys(source).sort();
    if (JSON.stringify(Object.keys(translated).sort()) !== JSON.stringify(sourceKeys))
      failures.push(`${locale}: message keys differ from English`);
    for (const key of sourceKeys) {
      if (typeof translated[key] !== 'string' || !translated[key].trim()) {
        failures.push(`${locale}.${key}: missing translation`);
        continue;
      }
      try {
        if (
          JSON.stringify(messageArgumentKinds(translated[key])) !==
          JSON.stringify(messageArgumentKinds(source[key]))
        )
          failures.push(`${locale}.${key}: interpolation arguments differ`);
      } catch (error) {
        failures.push(`${locale}.${key}: invalid ICU: ${error}`);
      }
    }
    if (
      locale !== 'en' &&
      sourceKeys.some((key) => !properNames.has(source[key])) &&
      sourceKeys.every((key) => translated[key] === source[key])
    )
      failures.push(`${locale}: catalog contains only copied English messages`);
  }
  return failures;
}

export function untranslatedUi(source, filename, catalogBindings = new Map()) {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  const callbacks = new Set();
  function collectCallbacks(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.id) callbacks.add(node.id.name);
    if (
      node.type === 'VariableDeclarator' &&
      ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.init?.type)
    )
      callbacks.add(node.id.name);
    if (
      node.type === 'Identifier' &&
      node.typeAnnotation?.typeAnnotation?.type === 'TSFunctionType'
    )
      callbacks.add(node.name);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(collectCallbacks);
      else if (value && typeof value === 'object') collectCallbacks(value);
    }
  }
  collectCallbacks(ast.program);
  for (const statement of ast.program.body) {
    if (
      statement.type === 'ExpressionStatement' &&
      statement.expression.type === 'StringLiteral' &&
      ['use client', 'use server'].includes(statement.expression.value)
    )
      throw new Error(
        `${statement.expression.value} directive must precede imports (${filename}:${statement.loc.start.line})`,
      );
  }
  const findings = [];
  function candidate(value, node, kind) {
    const text = value.replace(/\s+/g, ' ').trim();
    if (
      !/[A-Za-z]{2}/.test(text) ||
      properNames.has(text) ||
      /^https?:|^[\w.-]+@[\w.-]+$/.test(text)
    )
      return;
    findings.push({ file: filename, line: node.loc.start.line, kind, text });
  }
  const displayAttributes =
    /^(?:title|label|ariaLabel|fallbackLabel|readyLabel|lightboxTitle|approveLabel|countLabel|searchPlaceholder|secondaryHeaderLabel|expandedDescription|expandedTitle|emptyTitle|emptyDescription|rejectLabel|retryLabel|suggestionLabel|emptyHint|emptyLabel|legend|badge|summary|text|heading|headline|note|tooltip|hint|helper|body|sub|message|error|placeholder|description|aria-label|aria-description|aria-roledescription|alt|emptyText|emptyMessage|emptyState|showLabel|caption|helperText|loadingText)$/;
  const bindings = new Map();
  function collectBindings(node, enclosing = ast.program) {
    if (!node || typeof node !== 'object') return;
    const scope = [
      'Program',
      'BlockStatement',
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'ObjectMethod',
      'ClassMethod',
    ].includes(node.type)
      ? node
      : enclosing;
    const name =
      node.type === 'VariableDeclarator'
        ? node.id?.name
        : node.type === 'AssignmentPattern'
          ? node.left?.name
          : null;
    const value = node.type === 'VariableDeclarator' ? node.init : node.right;
    if (name && value) {
      const declarations = bindings.get(name) ?? [];
      declarations.push({ scope, value });
      bindings.set(name, declarations);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach((value) => collectBindings(value, scope));
      else if (child && typeof child === 'object') collectBindings(child, scope);
    }
  }
  collectBindings(ast.program);
  function displayExpression(node, kind, allowCode = false, seen = new Set()) {
    if (!node || seen.has(node)) return;
    seen.add(node);
    if (node.type === 'Identifier') {
      const declaration = (bindings.get(node.name) ?? [])
        .filter(({ scope }) => scope.start <= node.start && scope.end >= node.end)
        .sort((a, b) => a.scope.end - a.scope.start - (b.scope.end - b.scope.start))[0];
      if (declaration) displayExpression(declaration.value, kind, allowCode, seen);
      return;
    }
    if (allowCode && node.type === 'StringLiteral' && /^[a-z][a-z0-9_.-]*$/.test(node.value))
      return;
    if (node.type === 'StringLiteral') candidate(node.value, node, kind);
    else if (
      node.type === 'TemplateLiteral' &&
      /[A-Za-z]{2}/.test(node.quasis.map((part) => part.value.cooked).join(''))
    )
      candidate(node.quasis.map((part) => part.value.cooked).join('{value}'), node, kind);
    else if (node.type === 'ConditionalExpression') {
      displayExpression(node.consequent, kind, allowCode, seen);
      // Pure helpers retain an English default while their production UI callers pass a translator.
      if (
        !(
          node.test.type === 'Identifier' &&
          /^(?:t|uiText|uiTranslate|translate|translateUi)$/.test(node.test.name) &&
          node.consequent.type === 'CallExpression'
        )
      )
        displayExpression(node.alternate, kind, allowCode, seen);
    } else if (node.type === 'LogicalExpression')
      displayExpression(node.right, kind, allowCode, seen);
    else if (node.type === 'BinaryExpression' && node.operator === '+') {
      displayExpression(node.left, kind, allowCode, seen);
      displayExpression(node.right, kind, allowCode, seen);
    }
  }
  const translationHooks = new Set(['useTranslations', 'useLocale', 'useFormatter']);
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== 'next-intl') continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier' && translationHooks.has(specifier.imported.name))
        translationHooks.add(specifier.local.name);
    }
  }
  function walk(node, inCode = false, parent = null, inClassMethod = false) {
    if (!node || typeof node !== 'object') return;
    inClassMethod ||= node.type === 'ClassMethod';
    if (inClassMethod && node.type === 'CallExpression' && translationHooks.has(node.callee.name))
      findings.push({
        file: filename,
        line: node.loc.start.line,
        kind: 'hook in class method',
        text: node.callee.name,
      });
    const tag = node.type === 'JSXElement' ? node.openingElement.name.name : null;
    if (tag === 'code' || tag === 'pre' || tag === 'script' || tag === 'style') inCode = true;
    if (!inCode && node.type === 'JSXText') candidate(node.value, node, 'text');
    if (
      !inCode &&
      node.type === 'JSXAttribute' &&
      displayAttributes.test(node.name.name) &&
      node.value?.type === 'StringLiteral'
    )
      candidate(node.value.value, node.value, 'attribute');
    if (!inCode && node.type === 'JSXExpressionContainer') {
      if (parent?.type === 'JSXElement') displayExpression(node.expression, 'dynamic text');
      else if (parent?.type === 'JSXAttribute' && displayAttributes.test(parent.name?.name))
        displayExpression(node.expression, `dynamic ${parent.name.name}`);
    }
    if (
      !inCode &&
      node.type === 'TemplateLiteral' &&
      /(?:\/app\/.*\/route\.ts$|\/lib\/auth\/)/.test(`/${filename}`) &&
      /<!doctype html|<html/i.test(node.quasis.map((part) => part.value.cooked).join(''))
    ) {
      const html = node.quasis
        .map((part) => part.value.cooked)
        .join('I18N_DYNAMIC')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
      for (const match of html.matchAll(/>([^<]+)</g)) {
        const visible = match[1].replace(/I18N_DYNAMIC/g, '').trim();
        if (visible) candidate(visible, node, 'HTML text');
      }
      for (const [index, expression] of node.expressions.entries()) {
        const before = node.quasis[index].value.cooked ?? '';
        const after = node.quasis[index + 1].value.cooked ?? '';
        if (/>\s*$/.test(before) && /^\s*</.test(after)) displayExpression(expression, 'HTML text');
      }
    }
    if (!inCode && ['CallExpression', 'OptionalCallExpression'].includes(node.type)) {
      const callee = node.callee;
      const key = node.arguments[0]?.type === 'StringLiteral' ? node.arguments[0].value : null;
      const signatures = catalogBindings.get(key);
      const method = callee.type === 'MemberExpression' ? callee.property?.name : null;
      if (
        signatures?.length &&
        method !== 'raw' &&
        signatures.every((item) => JSON.stringify(item) === JSON.stringify(signatures[0]))
      ) {
        const values = node.arguments[1];
        if (
          values?.type === 'ObjectExpression' &&
          !values.properties.some((property) => property.type === 'SpreadElement')
        ) {
          for (const [name, kind] of Object.entries(signatures[0])) {
            const property = values.properties.find(
              (item) => (item.key?.name ?? item.key?.value) === name,
            );
            const value = property?.value;
            const callback = ['ArrowFunctionExpression', 'FunctionExpression'].includes(
              value?.type,
            );
            const concrete =
              [
                'StringLiteral',
                'NumericLiteral',
                'BooleanLiteral',
                'TemplateLiteral',
                'JSXElement',
                'JSXFragment',
                'NullLiteral',
              ].includes(value?.type) ||
              (value?.type === 'Identifier' && !callbacks.has(value.name));
            if (
              (kind === 'tag' && (!property || concrete || !['rich', 'markup'].includes(method))) ||
              (kind === 'value' && callback)
            ) {
              findings.push({
                file: filename,
                line: node.loc.start.line,
                kind: 'ICU binding',
                text: `${key}: ${name} requires ${kind === 'tag' ? 'a rich-text callback' : 'an interpolation value'}`,
              });
            }
          }
        }
      }
      if (
        callee.type === 'Identifier' &&
        /^(?:setError|setMessage|setAnnouncement|setResultNote|showError)$/.test(callee.name)
      )
        displayExpression(node.arguments[0], 'UI feedback', true);
      if (
        callee.type === 'MemberExpression' &&
        callee.object.name === 'toast' &&
        ['success', 'error', 'warning', 'info'].includes(callee.property.name)
      )
        displayExpression(node.arguments[0], 'notification');
      const notification =
        (callee.type === 'Identifier' &&
          ['show', 'showError', 'showSuccess'].includes(callee.name)) ||
        (['MemberExpression', 'OptionalMemberExpression'].includes(callee.type) &&
          ['controls', 'toast', 'notifications'].includes(callee.object.name) &&
          ['show', 'showError', 'showSuccess', 'showToast'].includes(callee.property.name));
      if (notification && node.arguments[0]?.type === 'ObjectExpression') {
        for (const property of node.arguments[0].properties)
          if (
            property.type === 'ObjectProperty' &&
            ['title', 'description', 'message'].includes(property.key.name ?? property.key.value)
          )
            displayExpression(property.value, 'notification');
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach((child) => walk(child, inCode, node, inClassMethod));
      else walk(value, inCode, node, inClassMethod);
    }
  }
  walk(ast);
  return findings;
}

export function translatedMachineValues(source, filename) {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  const translatorNames = new Set();
  const findings = [];
  const machineAttributes = new Set([
    'value',
    'status',
    'type',
    'mode',
    'id',
    'href',
    'className',
    'role',
    'aria-sort',
    'aria-live',
    'data-state',
    'data-status',
    'data-testid',
    'platform',
    'variant',
  ]);
  function traverse(node, parents, visitor) {
    if (!node || typeof node !== 'object') return;
    visitor(node, parents);
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
      if (Array.isArray(value))
        value.forEach((child) => traverse(child, [...parents, node], visitor));
      else traverse(value, [...parents, node], visitor);
    }
  }
  traverse(ast, [], (node) => {
    const init = node.type === 'VariableDeclarator' ? node.init : null;
    const call = init?.type === 'AwaitExpression' ? init.argument : init;
    if (
      call?.type === 'CallExpression' &&
      ['useTranslations', 'getTranslations'].includes(call.callee.name) &&
      node.id.type === 'Identifier'
    )
      translatorNames.add(node.id.name);
  });
  const scopeOf = (parents) =>
    [...parents]
      .reverse()
      .find((node) => /^(?:Function|ArrowFunction|ObjectMethod|ClassMethod)/.test(node.type))
      ?.start ?? 0;
  const aliases = new Set();
  function translationCall(node) {
    if (node?.type !== 'CallExpression' && node?.type !== 'OptionalCallExpression') return false;
    const callee = node.callee;
    return (
      translatorNames.has(callee.name) ||
      /^localize\w+Copy$/.test(callee.name ?? '') ||
      (['MemberExpression', 'OptionalMemberExpression'].includes(callee.type) &&
        ((translatorNames.has(callee.object.name) &&
          ['rich', 'markup', 'raw'].includes(callee.property.name)) ||
          (['ui', 'ctx'].includes(callee.object.name) &&
            ['t', 'translate'].includes(callee.property.name))))
    );
  }
  function containsTranslation(node) {
    if (
      !node ||
      !['CallExpression', 'ConditionalExpression', 'LogicalExpression', 'Identifier'].includes(
        node.type,
      )
    )
      return false;
    if (node.type === 'CallExpression') return translationCall(node);
    if (node.type === 'ConditionalExpression')
      return containsTranslation(node.consequent) || containsTranslation(node.alternate);
    if (node.type === 'LogicalExpression') return containsTranslation(node.right);
    return false;
  }
  traverse(ast, [], (node, parents) => {
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      containsTranslation(node.init)
    )
      aliases.add(`${scopeOf(parents)}:${node.id.name}`);
  });
  traverse(ast, [], (node, parents) => {
    const translatedCall = translationCall(node);
    const translatedAlias =
      node.type === 'Identifier' &&
      aliases.has(`${scopeOf(parents)}:${node.name}`) &&
      !(parents.at(-1)?.type === 'VariableDeclarator' && parents.at(-1).id === node) &&
      !(
        parents.at(-1)?.type === 'MemberExpression' &&
        !parents.at(-1).computed &&
        parents.at(-1).property === node
      ) &&
      !(
        parents.at(-1)?.type === 'ObjectProperty' &&
        !parents.at(-1).computed &&
        !parents.at(-1).shorthand &&
        parents.at(-1).key === node
      );
    if (!translatedCall && !translatedAlias) return;
    const attribute = [...parents].reverse().find((parent) => parent.type === 'JSXAttribute');
    const comparison = parents.some(
      (parent) =>
        parent.type === 'BinaryExpression' &&
        ['===', '!==', '==', '!='].includes(parent.operator) &&
        ![parent.left, parent.right].some(
          (operand) =>
            ['NullLiteral', 'BooleanLiteral'].includes(operand.type) ||
            (operand.type === 'Identifier' && operand.name === 'undefined'),
        ),
    );
    const computedKey = parents.some(
      (parent) =>
        parent.type === 'ObjectProperty' &&
        parent.computed &&
        node.start >= parent.key.start &&
        node.end <= parent.key.end,
    );
    const lookup = parents.some(
      (parent) =>
        parent.type === 'MemberExpression' &&
        parent.computed &&
        node.start >= parent.property.start &&
        node.end <= parent.property.end,
    );
    const predicate = parents.some(
      (parent) =>
        parent.type === 'CallExpression' &&
        parent.callee.type === 'MemberExpression' &&
        ['includes', 'has', 'get', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf'].includes(
          parent.callee.property.name,
        ) &&
        parent.arguments.some(
          (argument) => node.start >= argument.start && node.end <= argument.end,
        ),
    );
    const switchValue = parents.some(
      (parent) =>
        (parent.type === 'SwitchCase' &&
          parent.test &&
          node.start >= parent.test.start &&
          node.end <= parent.test.end) ||
        (parent.type === 'SwitchStatement' &&
          node.start >= parent.discriminant.start &&
          node.end <= parent.discriminant.end),
    );
    const conditionOnly = parents.some(
      (parent) =>
        (parent.type === 'ConditionalExpression' &&
          node.start >= parent.test.start &&
          node.end <= parent.test.end) ||
        (parent.type === 'LogicalExpression' &&
          node.start >= parent.left.start &&
          node.end <= parent.left.end),
    );
    const opening = [...parents].reverse().find((parent) => parent.type === 'JSXOpeningElement');
    const displayValue =
      attribute?.name?.name === 'value' && ['CommandItem', 'KpiTile'].includes(opening?.name?.name);
    if (
      comparison ||
      computedKey ||
      lookup ||
      predicate ||
      switchValue ||
      (machineAttributes.has(attribute?.name?.name) && !conditionOnly && !displayValue)
    )
      findings.push({
        file: filename,
        line: node.loc.start.line,
        kind: comparison
          ? 'comparison'
          : computedKey
            ? 'computed key'
            : lookup
              ? 'computed lookup'
              : predicate
                ? 'machine predicate'
                : switchValue
                  ? 'switch value'
                  : `machine attribute ${attribute.name.name}`,
        text: source.slice(node.start, node.end),
      });
  });
  return findings;
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory())
      return /^(?:__tests__|__eval__|__fixtures__|dev-preview)$/.test(entry.name)
        ? []
        : files(file);
    return /\.(?:ts|tsx)$/.test(file) &&
      !/\.(?:test|spec|stories|dev)\./.test(file) &&
      !file.endsWith('.d.ts')
      ? [file]
      : [];
  });
}

export function check(projectDirectory = project) {
  const errors = [];
  const catalogBindings = new Map();
  try {
    const manifest = buildMessageScopes(projectDirectory);
    const expected = JSON.stringify(manifest);
    const current = JSON.stringify(
      JSON.parse(
        readFileSync(path.join(projectDirectory, 'src/i18n/message-scopes.generated.json'), 'utf8'),
      ),
    );
    if (current !== expected)
      errors.push('Client message scopes are stale. Run bun run i18n:sync.');
    for (const [file, content] of lazyCatalogOutputs(projectDirectory, manifest))
      if (
        !existsSync(path.join(projectDirectory, file)) ||
        readFileSync(path.join(projectDirectory, file), 'utf8') !== content
      )
        errors.push(`Lazy client catalog is stale: ${file}. Run bun run i18n:sync.`);
  } catch (error) {
    errors.push(`Client message scopes: ${error}`);
  }
  const messagesDirectory = path.join(projectDirectory, 'messages');
  for (const entry of readdirSync(messagesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const catalogs = Object.fromEntries(
        locales.map((locale) => [
          locale,
          JSON.parse(
            readFileSync(path.join(messagesDirectory, entry.name, `${locale}.json`), 'utf8'),
          ),
        ]),
      );
      errors.push(...validateCatalogs(catalogs).map((error) => `${entry.name}: ${error}`));
      if (!entry.name.startsWith('client-')) {
        for (const [key, message] of Object.entries(flatten(catalogs.en))) {
          const signatures = catalogBindings.get(key) ?? [];
          signatures.push(messageArgumentKinds(message));
          catalogBindings.set(key, signatures);
        }
      }
    } catch (error) {
      errors.push(`${entry.name}: ${error}`);
    }
  }
  try {
    const emergency = Object.fromEntries(
      locales.map((locale) => [
        locale,
        JSON.parse(
          readFileSync(path.join(projectDirectory, 'src/i18n/emergency', `${locale}.json`), 'utf8'),
        ),
      ]),
    );
    errors.push(...validateCatalogs(emergency).map((error) => `emergency: ${error}`));
  } catch (error) {
    errors.push(`emergency: ${error}`);
  }
  const findings = [];
  const machineFindings = [];
  for (const file of files(path.join(projectDirectory, 'src'))) {
    try {
      const source = readFileSync(file, 'utf8');
      const relative = path.relative(projectDirectory, file);
      findings.push(...untranslatedUi(source, relative, catalogBindings));
      machineFindings.push(...translatedMachineValues(source, relative));
    } catch (error) {
      errors.push(`${path.relative(projectDirectory, file)}: ${error}`);
    }
  }
  const exceptionFile = path.join(projectDirectory, 'scripts/i18n/literal-exceptions.json');
  const exceptions = existsSync(exceptionFile)
    ? JSON.parse(readFileSync(exceptionFile, 'utf8'))
    : [];
  const accepted = [];
  for (const exception of exceptions) {
    if (
      !exception ||
      typeof exception.file !== 'string' ||
      !exception.file.startsWith('src/') ||
      /[*?]/.test(exception.file) ||
      typeof exception.kind !== 'string' ||
      typeof exception.text !== 'string' ||
      !exception.text ||
      typeof exception.reason !== 'string' ||
      exception.reason.length < 12
    ) {
      errors.push(
        'Literal exceptions require an exact source path, kind, text and reviewed reason',
      );
      continue;
    }
    const matches = findings.filter(
      (finding) =>
        finding.file === exception.file &&
        finding.kind === exception.kind &&
        finding.text === exception.text,
    );
    if (!matches.length)
      errors.push(`Stale literal exception: ${exception.file}: ${exception.text}`);
    accepted.push(...matches);
  }
  return {
    errors,
    findings: findings.filter((finding) => !accepted.includes(finding)),
    machineFindings,
    exceptions: accepted,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = check();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result));
  else {
    for (const error of result.errors.slice(0, 20)) console.error(`FAIL ${error}`);
    for (const item of result.findings.slice(0, 20))
      console.error(
        `${item.file}:${item.line}: untranslated ${item.kind}: ${item.text.slice(0, 100)}`,
      );
    for (const item of result.machineFindings.slice(0, 20))
      console.error(
        `${item.file}:${item.line}: translated ${item.kind}: ${item.text.slice(0, 100)}`,
      );
    console.log(
      `i18n: ${result.errors.length} catalog/parser/scope failures; ${result.findings.length} untranslated UI literals; ${result.machineFindings.length} translated machine values; ${result.exceptions.length} reviewed literal exceptions`,
    );
  }
  process.exitCode =
    result.errors.length || result.findings.length || result.machineFindings.length ? 1 : 0;
}
