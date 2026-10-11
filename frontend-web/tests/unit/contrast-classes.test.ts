import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// White text on a light, saturated colour cannot be read: white on amber-500 is 2.1:1, on green-500 2.3:1, on emerald-500 2.5:1, on orange-500
// 2.8:1 (the minimum is 3:1 for large text and for icons, 4.5:1 for small text). The refund, payout and "Add Photo" buttons were made this way.
// The shades from 600 up are dark enough for a badge or an icon; a button with words uses 700.
const LIGHT_SATURATED = /^bg-(amber|yellow|lime|orange|emerald|green|teal|cyan|sky)-(50|100|200|300|400|500)$/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === '.next' ? [] : sources(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

test('no element is white text on a light saturated background (use the 600 shade for an icon or number, 700 for words)', () => {
  const offenders: string[] = [];
  for (const dir of ['app', 'components']) {
    for (const file of sources(join(process.cwd(), dir))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const tokens = line.split(/[\s"'`{}()]+/);
        if (tokens.includes('text-white') && tokens.some((token) => LIGHT_SATURATED.test(token))) {
          offenders.push(`${file.replace(process.cwd() + '/', '')}:${i + 1}: ${line.trim().slice(0, 110)}`);
        }
      });
    }
  }
  assert.deepEqual(offenders, []);
});

test('the guard does catch the combinations it is about', () => {
  for (const line of ['<button className="bg-amber-500 text-white">', "cond ? 'bg-emerald-500 text-white' : 'bg-white text-gray-400'", '<span className="text-white bg-green-400 px-2">']) {
    const tokens = line.split(/[\s"'`{}()]+/);
    assert.ok(tokens.includes('text-white') && tokens.some((token) => LIGHT_SATURATED.test(token)), line);
  }
  for (const line of ['<button className="bg-amber-700 text-white">', '<div className="bg-emerald-500/10 text-white">', '<a className="hover:bg-emerald-500 text-white bg-slate-900">']) {
    const tokens = line.split(/[\s"'`{}()]+/);
    assert.ok(!(tokens.includes('text-white') && tokens.some((token) => LIGHT_SATURATED.test(token))), line);
  }
});
