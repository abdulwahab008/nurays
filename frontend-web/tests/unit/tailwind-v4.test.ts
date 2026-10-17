import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Tailwind v4 dropped the v3 opacity utilities: `bg-black bg-opacity-50` paints solid black and `bg-white bg-opacity-20` solid white
// (the keyboard-shortcuts overlay hid the whole page and the "Ctrl+S" hint was white on white). Nothing complains, so this does.
const REMOVED = /(?<![\w-])(bg|text|border|divide|ring|placeholder)-opacity-\d+/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === '.next' ? [] : sources(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

test('no source file uses a Tailwind v3 opacity utility that v4 ignores (write bg-black/50, not bg-black bg-opacity-50)', () => {
  const offenders: string[] = [];
  for (const dir of ['app', 'components', 'lib']) {
    for (const file of sources(join(process.cwd(), dir))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (REMOVED.test(line)) offenders.push(`${file.replace(process.cwd() + '/', '')}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
  }
  assert.deepEqual(offenders, []);
});
