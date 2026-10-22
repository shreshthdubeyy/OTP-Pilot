import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = process.argv.slice(2);
const allowedTargets = new Set(['chrome', 'firefox']);

if (targets.length === 0 || targets.some((target) => !allowedTargets.has(target))) {
  console.error('Usage: node scripts/build.js <chrome|firefox> [chrome|firefox]');
  process.exitCode = 1;
} else {
  for (const target of new Set(targets)) {
    const output = path.join(root, 'dist', target);
    const relativeOutput = path.relative(root, output);
    if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
      throw new Error('Refusing to clean a build output outside the project folder.');
    }
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    await cp(path.join(root, 'src'), path.join(output, 'src'), { recursive: true });
    await cp(path.join(root, 'icons'), path.join(output, 'icons'), { recursive: true });
    await cp(path.join(root, 'config.example.json'), path.join(output, 'config.example.json'));

    const manifestPath = target === 'chrome'
      ? path.join(root, 'manifest.json')
      : path.join(root, 'manifests', 'manifest.firefox.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Built ${target} unpacked extension: ${path.relative(root, output)}`);
  }
}
