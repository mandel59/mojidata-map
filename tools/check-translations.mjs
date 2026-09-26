import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from '@babel/parser';

const root = process.cwd();
const messageDir = path.join(root, 'src/intl/messages');
const sourceDir = path.join(root, 'src');
const locales = ['ja', 'en'];
const namespaces = ['app', 'common', 'search', 'fonts'];
const catalogs = Object.fromEntries(locales.map((locale) => [locale, {}]));
const problems = [];
const interpolationPattern = /{{\s*-?\s*([\w.]+)\s*-?\s*}}/g;

function placeholders(text) {
  return [...text.matchAll(interpolationPattern)].map((match) => match[1]).sort();
}

function isDefinitelyString(expression) {
  if (!expression) return false;
  if (['StringLiteral', 'TemplateLiteral'].includes(expression.type)) return true;
  if (expression.type === 'TSAsExpression' || expression.type === 'TSTypeAssertion')
    return isDefinitelyString(expression.expression);
  if (expression.type !== 'CallExpression') return false;
  const callee = expression.callee;
  return (
    (callee.type === 'Identifier' && callee.name === 'String') ||
    (callee.type === 'MemberExpression' &&
      !callee.computed &&
      ['format', 'toLocaleString', 'toString'].includes(callee.property.name))
  );
}

function countOptionStatus(options) {
  if (options?.type !== 'ObjectExpression') return 'missing';
  const property = options.properties.find(
    (item) =>
      item.type === 'ObjectProperty' &&
      ((item.key.type === 'Identifier' && item.key.name === 'count') ||
        (item.key.type === 'StringLiteral' && item.key.value === 'count')),
  );
  if (!property) return 'missing';
  if (isDefinitelyString(property.value)) return 'non-numeric';
  return 'present';
}

async function loadCatalogs() {
  for (const namespace of namespaces) {
    for (const locale of locales) {
      const filename = path.join(messageDir, `${namespace}.${locale}.json`);
      try {
        catalogs[locale][namespace] = JSON.parse(await readFile(filename, 'utf8'));
      } catch (error) {
        problems.push(`${path.relative(root, filename)}: ${error.message}`);
        catalogs[locale][namespace] = {};
      }
    }

    const ja = catalogs.ja[namespace];
    const en = catalogs.en[namespace];
    for (const key of new Set([...Object.keys(ja), ...Object.keys(en)])) {
      if (!(key in ja)) problems.push(`${namespace}: missing Japanese key ${JSON.stringify(key)}`);
      if (!(key in en)) problems.push(`${namespace}: missing English key ${JSON.stringify(key)}`);
      if (!(key in ja) || !(key in en)) continue;
      const jaPlaceholders = placeholders(ja[key]);
      const enPlaceholders = placeholders(en[key]);
      if (JSON.stringify(jaPlaceholders) !== JSON.stringify(enPlaceholders)) {
        problems.push(
          `${namespace}.${JSON.stringify(key)}: interpolation mismatch ` +
            `(ja: ${jaPlaceholders.join(', ') || 'none'}; en: ${enPlaceholders.join(', ') || 'none'})`,
        );
      }
    }
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(filename)));
    else if (
      /\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(entry.name) &&
      !/\.d\.[cm]?ts$/.test(entry.name)
    )
      files.push(filename);
  }
  return files;
}

function collectTranslationKeys(ast, filename) {
  const keys = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const callee = node.callee;
    const calleeName =
      callee?.type === 'Identifier'
        ? callee.name
        : callee?.type === 'MemberExpression' && !callee.computed
          ? callee.property.name
          : undefined;
    const firstArgument = node.arguments?.[0];
    const key =
      firstArgument?.type === 'StringLiteral'
        ? firstArgument.value
        : firstArgument?.type === 'TemplateLiteral' && firstArgument.expressions.length === 0
          ? firstArgument.quasis[0].value.cooked
          : undefined;
    if (
      ['CallExpression', 'OptionalCallExpression'].includes(node.type) &&
      ['t', 'tr'].includes(calleeName) &&
      typeof key === 'string'
    ) {
      keys.push({
        key,
        line: node.loc?.start.line ?? 0,
        countStatus: countOptionStatus(node.arguments[1]),
      });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value);
    }
  };
  visit(ast);
  return keys.map(({ key, line, countStatus }) => ({ key, line, countStatus, filename }));
}

async function checkSourceKeys() {
  const catalogKeys = new Set(
    locales.flatMap((locale) =>
      namespaces.flatMap((namespace) => Object.keys(catalogs[locale][namespace])),
    ),
  );
  for (const filename of await sourceFiles(sourceDir)) {
    const relative = path.relative(root, filename);
    const source = await readFile(filename, 'utf8');
    let ast;
    try {
      ast = parse(source, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators-legacy'],
        errorRecovery: false,
      });
    } catch (error) {
      problems.push(`${relative}: Babel parse error: ${error.message}`);
      continue;
    }
    for (const { key, line, countStatus } of collectTranslationKeys(ast, relative)) {
      // Dynamic keys are intentionally skipped; untranslated data/native strings
      // are also out of scope because they are not t()/tr() message keys.
      const hasPluralForms = ['zero', 'one', 'two', 'few', 'many', 'other'].some((form) =>
        catalogKeys.has(`${key}_${form}`),
      );
      if (!catalogKeys.has(key) && !hasPluralForms)
        problems.push(`${relative}:${line}: missing translation key ${JSON.stringify(key)}`);
      else if (hasPluralForms && countStatus === 'missing')
        problems.push(
          `${relative}:${line}: pluralized key ${JSON.stringify(key)} needs a numeric count option`,
        );
      else if (hasPluralForms && countStatus === 'non-numeric')
        problems.push(
          `${relative}:${line}: pluralized key ${JSON.stringify(key)} has a formatted/string count option`,
        );
    }
  }
}

await loadCatalogs();
await checkSourceKeys();
if (problems.length) {
  console.error(`Translation check failed with ${problems.length} issue(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Translations OK: ${namespaces.length} namespaces, ${locales.length} locales.`);
}
