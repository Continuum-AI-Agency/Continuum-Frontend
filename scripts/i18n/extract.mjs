import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';
import { translatedMachineValues, untranslatedUi } from './check.mjs';
import { literalMessage } from './protect.mjs';

export function namespaceFor(file) {
  for (const [pattern, namespace] of [
    [/CampaignCanvas|paid-media|\/scale\//, 'scale'],
    [/\/organic\//, 'organic'],
    [/\/onboarding\//, 'onboarding'],
    [/\/dashboard|\/goals\//, 'dashboard'],
    [/\/settings\//, 'settings'],
    [/\/library\//, 'library'],
    [/\/forge\//, 'forge'],
    [/StudioCanvas|studio|video-editor/, 'studio'],
    [/\/automations\//, 'automations'],
    [/\/admin\//, 'admin'],
    [/competitor/, 'competitor'],
    [/\/(?:open|share)\//, 'public'],
    [/\/(?:login|signup|reset-password|set-password)\//, 'auth'],
  ])
    if (pattern.test(file)) return namespace;
  return 'common';
}

export function jsxText(value) {
  const lines = value.split(/\r\n|\n|\r/);
  let last = 0;
  let result = '';
  for (let index = 0; index < lines.length; index++) if (/[^ \t]/.test(lines[index])) last = index;
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index].replace(/\t/g, ' ');
    if (index !== 0) line = line.replace(/^ +/, '');
    if (index !== lines.length - 1) line = line.replace(/ +$/, '');
    if (line) result += line + (index !== last ? ' ' : '');
  }
  return result;
}

function visit(node, visitor, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  visitor(node, ancestors);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments'].includes(key)) continue;
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child === 'object') visit(child, visitor, [...ancestors, node]);
  }
}

function functionName(node, parent) {
  return (
    node.id?.name ??
    (parent?.type === 'VariableDeclarator' ? parent.id.name : null) ??
    (parent?.type === 'ExportDefaultDeclaration' ? 'Page' : '')
  );
}

function containsEnglishBranch(expression) {
  if (
    !expression ||
    expression.type === 'CallExpression' ||
    (expression.type === 'BinaryExpression' && expression.operator !== '+')
  )
    return false;
  if (expression.type === 'StringLiteral') return /[A-Za-z]{2}/.test(expression.value);
  return Object.entries(expression).some(
    ([key, value]) =>
      !['loc', 'extra', 'comments'].includes(key) &&
      (Array.isArray(value)
        ? value.some(containsEnglishBranch)
        : value && typeof value === 'object' && containsEnglishBranch(value)),
  );
}

function countPlural(node, source) {
  if (
    node.type !== 'TemplateLiteral' ||
    node.expressions.length !== 2 ||
    node.quasis[1].value.cooked !== ' '
  )
    return null;
  const [count, choice] = node.expressions;
  if (
    !['Identifier', 'MemberExpression'].includes(count.type) ||
    choice.type !== 'ConditionalExpression' ||
    choice.test.type !== 'BinaryExpression' ||
    choice.test.operator !== '===' ||
    choice.test.right.type !== 'NumericLiteral' ||
    choice.test.right.value !== 1
  )
    return null;
  if (
    source.slice(choice.test.left.start, choice.test.left.end) !==
      source.slice(count.start, count.end) ||
    choice.consequent.type !== 'StringLiteral' ||
    choice.alternate.type !== 'StringLiteral'
  )
    return null;
  return {
    message:
      literalMessage(node.quasis[0].value.cooked) +
      `{count, plural, one {# ${literalMessage(choice.consequent.value)}} other {# ${literalMessage(choice.alternate.value)}}}` +
      literalMessage(node.quasis[2].value.cooked),
    argument: source.slice(count.start, count.end),
  };
}

/** Only direct React render literals are rewritten; helper/data flow remains an explicit finding. */
export function extractUi(source, filename, catalogs, exceptions = []) {
  const findings = untranslatedUi(source, filename).filter(
    (finding) =>
      !exceptions.some(
        (exception) =>
          exception.file === filename &&
          exception.kind === finding.kind &&
          exception.text === finding.text,
      ),
  );
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const translationImports = new Map();
  for (const statement of ast.program.body) {
    if (
      statement.type !== 'ImportDeclaration' ||
      !['next-intl', 'next-intl/server'].includes(statement.source.value)
    )
      continue;
    for (const specifier of statement.specifiers)
      if (specifier.type === 'ImportSpecifier')
        translationImports.set(specifier.local.name, specifier.imported.name);
  }
  let hookImport = 'useAutoTranslations';
  let serverImport = 'getAutoTranslations';
  while (new RegExp(`\\b${hookImport}\\b`).test(source)) hookImport += 'Local';
  while (new RegExp(`\\b${serverImport}\\b`).test(source)) serverImport += 'Local';
  const client = ast.program.directives.some((directive) => directive.value.value === 'use client');
  const boundaries = new Map();
  const edits = [];
  const messages = [];
  const handled = new Set();
  const memoDependencies = new Map();
  const functions = new Set([
    'FunctionDeclaration',
    'FunctionExpression',
    'ArrowFunctionExpression',
  ]);
  visit(ast.program, (node, ancestors) => {
    if (!['JSXText', 'StringLiteral', 'TemplateLiteral'].includes(node.type)) return;
    const parent = ancestors.at(-1);
    // A constant shared with a request or schema cannot safely become a render-time lookup.
    if (
      !(
        node.type === 'JSXText' ||
        parent?.type === 'JSXAttribute' ||
        parent?.type === 'JSXExpressionContainer'
      )
    )
      return;
    const text =
      node.type === 'TemplateLiteral'
        ? node.quasis.map((part) => part.value.cooked).join('{value}')
        : node.value;
    const plural = countPlural(node, source);
    const matches = findings.filter(
      (finding) =>
        finding.line === node.loc.start.line && finding.text === text.replace(/\s+/g, ' ').trim(),
    );
    if (
      !plural &&
      node.type === 'TemplateLiteral' &&
      node.expressions.some(containsEnglishBranch)
    ) {
      if (!matches.length && ancestors.at(-2)?.type === 'JSXElement')
        findings.push({
          file: filename,
          line: node.loc.start.line,
          kind: 'complex ICU sentence',
          text: source.slice(node.start, node.end),
        });
      return;
    }
    if (plural && !matches.length) {
      const finding = {
        file: filename,
        line: node.loc.start.line,
        kind: 'count plural',
        text: source.slice(node.start, node.end),
      };
      findings.push(finding);
      matches.push(finding);
    }
    if (!matches.length) return;
    const fnIndex = ancestors.findLastIndex(
      (candidate, index) =>
        functions.has(candidate.type) &&
        /^(?:[A-Z]|use[A-Z])/.test(functionName(candidate, ancestors[index - 1])),
    );
    const fn = ancestors[fnIndex];
    if (
      !fn ||
      ancestors.some((ancestor) => ancestor.type === 'ClassMethod') ||
      node.start < fn.body.start ||
      (client && fn.async)
    )
      return;
    // Expressions carrying English fragments need a whole ICU plural/select authored in context.
    let boundary = boundaries.get(fn);
    if (!boundary) {
      boundary = {
        namespace: namespaceFor(filename),
        name: 'autoText',
        fresh: true,
        async: fn.async,
      };
      while (new RegExp(`\\b${boundary.name}\\b`).test(source.slice(fn.start, fn.end)))
        boundary.name += 'Local';
      if (fn.body.type === 'BlockStatement')
        for (const statement of fn.body.body) {
          if (statement.type !== 'VariableDeclaration') continue;
          for (const declaration of statement.declarations) {
            const call =
              declaration.init?.type === 'AwaitExpression'
                ? declaration.init.argument
                : declaration.init;
            if (
              call?.type !== 'CallExpression' ||
              declaration.id.type !== 'Identifier' ||
              declaration.start > node.start
            )
              continue;
            if (
              !['useTranslations', 'getTranslations'].includes(
                translationImports.get(call.callee.name),
              )
            )
              continue;
            if (call.arguments[0]?.type === 'StringLiteral' && catalogs[call.arguments[0].value])
              boundary = {
                namespace: call.arguments[0].value,
                name: declaration.id.name,
                fresh: false,
              };
          }
        }
      boundaries.set(fn, boundary);
    }
    if (!catalogs[boundary.namespace]) throw new Error(`Unknown namespace ${boundary.namespace}`);
    const cleaned = node.type === 'JSXText' ? jsxText(node.value) : node.value;
    const message =
      plural?.message ??
      (node.type === 'TemplateLiteral'
        ? node.quasis
            .map(
              (part, index) =>
                literalMessage(part.value.cooked) +
                (index < node.expressions.length ? `{value${index}}` : ''),
            )
            .join('')
        : literalMessage(node.type === 'JSXText' ? cleaned.trim() : cleaned));
    const existing = Object.entries(catalogs[boundary.namespace]).find(
      ([, value]) => value === message,
    )?.[0];
    const key =
      existing ?? `auto_${createHash('sha256').update(message).digest('hex').slice(0, 12)}`;
    const collision = catalogs[boundary.namespace][key];
    if (collision !== undefined && collision !== message)
      throw new Error('Translation key collision');
    let replacement = `${boundary.name}(${JSON.stringify(key)}${plural ? `, {count: ${plural.argument}}` : node.type === 'TemplateLiteral' ? `, {${node.expressions.map((expression, index) => `value${index}: String(${source.slice(expression.start, expression.end)})`).join(', ')}}` : ''})`;
    if (node.type === 'JSXText')
      replacement = `${/^\s/.test(cleaned) ? ' ' : ''}{${replacement}}${/\s$/.test(cleaned) ? ' ' : ''}`;
    else if (parent.type === 'JSXAttribute') replacement = `{${replacement}}`;
    edits.push({ start: node.start, end: node.end, text: replacement });
    messages.push({
      namespace: boundary.namespace,
      key,
      message,
      file: filename,
      line: node.loc.start.line,
    });
    matches.forEach((finding) => handled.add(finding));
    for (const ancestor of ancestors.slice(fnIndex + 1)) {
      if (
        ancestor.type !== 'CallExpression' ||
        !['useMemo', 'useCallback'].includes(ancestor.callee.name)
      )
        continue;
      const dependency = ancestor.arguments[1];
      if (dependency?.type !== 'ArrayExpression') continue;
      const names = memoDependencies.get(dependency) ?? new Set();
      if (!dependency.elements.some((item) => item?.name === boundary.name))
        names.add(boundary.name);
      memoDependencies.set(dependency, names);
    }
  });
  for (const [fn, boundary] of boundaries) {
    if (!boundary.fresh) continue;
    const declaration = `const ${boundary.name} = ${boundary.async ? `await ${serverImport}` : hookImport}(${JSON.stringify(boundary.namespace)});`;
    if (fn.body.type === 'BlockStatement') {
      const position = fn.body.directives.at(-1)?.end ?? fn.body.start + 1;
      edits.push({ start: position, end: position, text: `\n${declaration}\n` });
    } else {
      edits.push({ start: fn.body.start, end: fn.body.start, text: `{ ${declaration} return (` });
      edits.push({ start: fn.body.end, end: fn.body.end, text: '); }' });
    }
  }
  for (const [dependency, names] of memoDependencies) {
    if (!names.size) continue;
    const current = source
      .slice(dependency.start + 1, dependency.end - 1)
      .trim()
      .replace(/,\s*$/, '');
    edits.push({
      start: dependency.start,
      end: dependency.end,
      text: `[${[current, ...names].filter(Boolean).join(', ')}]`,
    });
  }
  const fresh = [...boundaries.values()].filter((boundary) => boundary.fresh);
  const imports = [
    fresh.some((item) => !item.async)
      ? `import {useTranslations as ${hookImport}} from 'next-intl';`
      : '',
    fresh.some((item) => item.async)
      ? `import {getTranslations as ${serverImport}} from 'next-intl/server';`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  if (imports) {
    const position = ast.program.directives.at(-1)?.end ?? 0;
    edits.push({ start: position, end: position, text: `\n${imports}\n` });
  }
  let output = source;
  let last = Infinity;
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > last) throw new Error(`Overlapping UI extraction in ${filename}`);
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    last = edit.start;
  }
  parse(output, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  if (translatedMachineValues(output, filename).length)
    throw new Error(`Extraction would translate machine values in ${filename}`);
  return { source: output, messages, pending: findings.filter((finding) => !handled.has(finding)) };
}
