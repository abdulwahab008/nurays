import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const at = (path: string) => new URL(path, import.meta.url);
const read = (path: string) => readFileSync(at(path), 'utf8');
const PLUGIN = '../../../mobile/node_modules/@capgo/capacitor-social-login/android/src/main/java/ee/forgr/capacitor/social/login/GoogleProvider.java';

// The Android plugin refuses any Google login that names scopes unless MainActivity extends its own activity, and
// nothing shows that until a real phone tries. Its defaults already cover e-mail, profile and openid.
test('Google sign-in sends no scopes while MainActivity is a plain BridgeActivity', () => {
  const activity = read('../../../mobile/android/app/src/main/java/pk/nuray/app/MainActivity.java');
  if (!/extends BridgeActivity/.test(activity)) return;
  const login = read('../../components/NativeSignInButtons.tsx').match(/plugin\.login\(\{[^\n]*\}\)/)?.[0] ?? '';
  assert.match(login, /provider === 'apple' \? \{ scopes: \['name', 'email'\] \} : \{\}/);
});

// Only where the app's packages are installed (the website's CI job does not install them).
test('the installed plugin still refuses scopes without its own main activity', { skip: !existsSync(at(PLUGIN)) && 'mobile/node_modules is not installed' }, () => {
  assert.match(read(PLUGIN), /CANNOT use scopes without modifying the main activity/);
});
