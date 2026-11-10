import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'workshops.html', 'styles.css', 'config.js', 'app.js', 'assets']) {
  await cp(path.join(root, file), path.join(dist, file), { recursive: true });
}
console.log('Static site built in dist/');
