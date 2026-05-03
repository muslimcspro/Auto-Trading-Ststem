import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.css', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const IGNORED_DIRECTORIES = new Set(['.git', '.server-build', 'data', 'dist', 'node_modules']);
const IGNORED_FILES = new Set(['package-lock.json']);
const DEFAULT_MAX_LINES = 1000;
const BASELINE_BUDGETS = new Map([
  ['src/styles.css', 16000],
  ['src/main.tsx', 7400],
  ['server/index.ts', 7000]
]);

function toPosixPath(file) {
  return file.replaceAll('\\', '/');
}

function listSourceFiles(directory = '.') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        files.push(...listSourceFiles(join(directory, entry.name)));
      }
      continue;
    }

    if (!entry.isFile() || IGNORED_FILES.has(entry.name) || entry.name.endsWith('.log')) continue;
    const file = toPosixPath(join(directory, entry.name)).replace(/^\.\//, '');
    const extension = file.slice(file.lastIndexOf('.'));
    if (SOURCE_EXTENSIONS.has(extension)) files.push(file);
  }
  return files;
}

const sourceFiles = listSourceFiles();

const rows = sourceFiles
  .map(file => {
    const content = readFileSync(file, 'utf8');
    const lines = content.length === 0 ? 0 : content.split(/\r?\n/).length;
    const sizeKb = Math.round((statSync(file).size / 1024) * 10) / 10;
    const budget = BASELINE_BUDGETS.get(file) ?? DEFAULT_MAX_LINES;
    return { file, lines, sizeKb, budget, overBudget: lines > budget };
  })
  .sort((left, right) => right.lines - left.lines);

const overBudget = rows.filter(row => row.overBudget);

console.log('Code health line budget');
console.table(rows.slice(0, 12).map(row => ({
  file: row.file,
  lines: row.lines,
  sizeKb: row.sizeKb,
  budget: row.budget,
  status: row.overBudget ? 'over budget' : 'ok'
})));

if (overBudget.length > 0) {
  console.error('\nLine budget failed. Split code before adding more to these files:');
  for (const row of overBudget) {
    console.error(`- ${row.file}: ${row.lines}/${row.budget} lines`);
  }
  process.exit(1);
}

const legacyFiles = rows.filter(row => BASELINE_BUDGETS.has(row.file));
if (legacyFiles.length > 0) {
  console.log('\nLegacy monolith baselines are allowed temporarily, but should only shrink:');
  for (const row of legacyFiles) {
    console.log(`- ${row.file}: ${row.lines}/${row.budget} lines`);
  }
}
