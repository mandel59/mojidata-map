import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const lock = await readJson('package-lock.json');
const app = await readJson('package.json');
function projectUrl(meta) {
  const repository = typeof meta.repository === 'string' ? meta.repository : meta.repository?.url;
  const candidate = meta.homepage || repository || '';
  const normalized = candidate
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@github.com\//, 'https://github.com/')
    .replace(/\.git$/, '');
  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
const libraries = [];
for (const [directory, entry] of Object.entries(lock.packages).sort(([a], [b]) =>
  a < b ? -1 : a > b ? 1 : 0,
)) {
  if (!directory || (entry.dev && directory !== 'node_modules/electron')) continue;
  const meta = await readJson(`${directory}/package.json`);
  if (meta.version !== entry.version)
    throw new Error(`Run npm ci: version mismatch for ${directory}`);
  const files = (await readdir(path.join(root, directory), { withFileTypes: true }))
    .filter((file) => file.isFile() && /^(licen[sc]e|copying|notice)([.-]|$)/i.test(file.name))
    .map((file) => file.name)
    .sort();
  const notices = await Promise.all(
    files.map(async (file) => ({
      file,
      text: await readFile(path.join(root, directory, file), 'utf8'),
    })),
  );
  libraries.push({
    name: meta.name,
    version: meta.version,
    license: typeof meta.license === 'string' ? meta.license : meta.license?.type || '未記載',
    author:
      typeof meta.author === 'string' ? meta.author.replace(/\s*[<(].*$/, '') : meta.author?.name,
    url: projectUrl(meta),
    scope: meta.name === 'electron' ? 'desktop' : 'shared',
    notices,
  });
}
await writeFile(
  path.join(root, 'public/credits.json'),
  JSON.stringify(
    {
      appVersion: app.version,
      appRepository: projectUrl({ repository: app.repository }),
      appLicense: await readFile(path.join(root, 'LICENSE'), 'utf8'),
      libraries,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Generated credits for ${libraries.length} runtime packages from package-lock.json.`);
