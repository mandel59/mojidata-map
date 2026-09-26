import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// Workers Static Assets free-plan limits; inspect uncompressed upload sizes.
const directory = path.resolve('dist');
const limit = 25 * 1024 * 1024;
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(filename);
    else if (entry.isFile()) files.push({ filename, size: (await stat(filename)).size });
    else throw new Error(`Unsupported asset: ${filename}`);
  }
}
await walk(directory);
if (!files.some(({ filename }) => filename === path.join(directory, 'index.html')))
  throw new Error('Missing dist/index.html. Run npm run build first.');
if (files.length > 20_000) throw new Error(`Too many assets: ${files.length} (limit 20,000)`);
for (const file of files)
  if (file.size > limit)
    throw new Error(`Asset exceeds 25 MiB: ${file.filename} (${file.size} bytes)`);
const largest = files.reduce((a, b) => (a.size > b.size ? a : b));
console.log(
  `${files.length} assets; largest: ${path.relative(directory, largest.filename)} (${(largest.size / 1024 / 1024).toFixed(2)} MiB / 25 MiB)`,
);
