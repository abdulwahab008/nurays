import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// The Android plugin refuses any Google login that names scopes unless MainActivity extends its own activity, and
// nothing shows that until a real phone tries. Its defaults already cover e-mail, profile and openid.
test('Google sign-in sends no scopes while MainActivity is a plain BridgeActivity', () => {
  const activity = read('../../../mobile/android/app/src/main/java/pk/nuray/app/MainActivity.java');
  const plugin = read('../../../mobile/node_modules/@capgo/capacitor-social-login/android/src/main/java/ee/forgr/capacitor/social/login/GoogleProvider.java');
  const buttons = read('../../components/NativeSignInButtons.tsx');
  if (!/extends BridgeActivity/.test(activity)) return;
  assert.match(plugin, /CANNOT use scopes without modifying the main activity/);
  const login = buttons.match(/plugin\.login\(\{[^\n]*\}\)/)?.[0] ?? '';
  assert.match(login, /provider === 'apple' \? \{ scopes: \['name', 'email'\] \} : \{\}/);
});
