import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
await mkdir(output, { recursive: true });
for (const entry of ['index.html', '404.html', 'css', 'js', 'icons', 'manifest.webmanifest']) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}
const worker = await readFile(path.join(root, 'sw.js'), 'utf8');
const assetPaths = [...worker.matchAll(/'((?:js|css|icons)\/[^']+|index\.html|manifest\.webmanifest)'/g)]
  .map(match => match[1]).sort();
const hash = createHash('sha256').update(worker);
for (const asset of assetPaths) hash.update(asset).update(await readFile(path.join(root, asset)));
const version = hash.digest('hex').slice(0, 16);
await writeFile(path.join(output, 'sw.js'), worker.replace(/const VERSION = '[^']+';/, `const VERSION = '${version}';`));
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Static site ready: dist/ (cache ${version})`);
