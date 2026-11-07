// Run with `npm test` (Node's own test runner, which reads TypeScript directly: no extra packages).
import test from 'node:test';
import assert from 'node:assert/strict';
import { appPathFromUrl, forgetSavedTokens, nativePlugins, secureKV, type SecureKV, type SecureStoragePlugin } from '../../lib/native-shell.ts';

function secureMemory(): SecureKV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v), remove: async (k) => void data.delete(k) };
}

test('the plugins are only read inside the app', () => {
  const Plugins = {};
  assert.equal(nativePlugins(undefined), null);
  assert.equal(nativePlugins({}), null);
  assert.equal(nativePlugins({ Capacitor: { isNativePlatform: () => false, Plugins } }), null);
  assert.equal(nativePlugins({ Capacitor: { isNativePlatform: () => true, Plugins } }), Plugins);
});

test('a link to the site or the app scheme opens its page; another site does not', () => {
  const site = 'https://nuray.pk';
  assert.equal(appPathFromUrl('https://nuray.pk/orders/123?placed=1#top', site), '/orders/123?placed=1#top');
  assert.equal(appPathFromUrl('pk.nuray.app://orders/123', site), '/orders/123');
  assert.equal(appPathFromUrl('pk.nuray.app://payment/return?order=9', site), '/payment/return?order=9');
  assert.equal(appPathFromUrl('pk.nuray.app://', site), '/');
  assert.equal(appPathFromUrl('https://evil.example/orders/1', site), null);
  assert.equal(appPathFromUrl('https://nuray.pk.evil.example/x', site), null);
  assert.equal(appPathFromUrl('javascript:alert(1)', site), null);
  assert.equal(appPathFromUrl('not a url', site), null);
});

test('the secure storage face prefixes keys and reads a missing one as null', async () => {
  const calls: unknown[] = [];
  const store = new Map<string, string>();
  const plugin: SecureStoragePlugin = {
    internalGetItem: async (o) => (calls.push(['get', o]), { data: store.get(o.prefixedKey) ?? null }),
    internalSetItem: async (o) => (calls.push(['set', o]), void store.set(o.prefixedKey, o.data)),
    internalRemoveItem: async (o) => (calls.push(['remove', o]), { success: store.delete(o.prefixedKey) }),
  };
  const kv = secureKV(plugin);
  assert.equal(await kv.get('refresh'), null);
  await kv.set('refresh', 'r1');
  assert.equal(await kv.get('refresh'), 'r1');
  await kv.remove('refresh');
  assert.equal(await kv.get('refresh'), null);
  assert.deepEqual(calls[1], ['set', { prefixedKey: 'nuray_refresh', data: 'r1', sync: false, access: 0 }]);
});

test('tokens an earlier version saved on the phone are removed', async () => {
  const secure = secureMemory();
  await secure.set('access', 'a1');
  await secure.set('refresh', 'r1');
  await secure.set('other', 'kept');
  await forgetSavedTokens(secure);
  assert.deepEqual([...secure.data], [['other', 'kept']]);
});

test('the platform is read only inside the app', async () => {
  const { nativePlatform } = await import('../../lib/native-shell.ts');
  assert.equal(nativePlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } }), 'ios');
  assert.equal(nativePlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }), 'android');
  assert.equal(nativePlatform({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }), null);
  assert.equal(nativePlatform(undefined), null);
});

test('buttons: Google where its client id is set, Apple on iPhones only', async () => {
  const { nativeProviders } = await import('../../lib/native-shell.ts');
  assert.deepEqual(nativeProviders('android', { web: 'w' }), { google: true, apple: false });
  assert.deepEqual(nativeProviders('android', {}), { google: false, apple: false });
  assert.deepEqual(nativeProviders('ios', { web: 'w' }), { google: false, apple: true });
  assert.deepEqual(nativeProviders('ios', { web: 'w', ios: 'i' }), { google: true, apple: true });
});

test("the plugin's settings follow the phone", async () => {
  const { socialLoginInit } = await import('../../lib/native-shell.ts');
  assert.deepEqual(socialLoginInit('android', { web: 'w', ios: 'i' }), { google: { webClientId: 'w', mode: 'online' } });
  assert.deepEqual(socialLoginInit('ios', { web: 'w', ios: 'i' }), {
    google: { iOSClientId: 'i', iOSServerClientId: 'w', mode: 'online' },
    apple: { clientId: 'pk.nuray.app', redirectUrl: '' },
  });
  assert.deepEqual(socialLoginInit('ios', {}), { apple: { clientId: 'pk.nuray.app', redirectUrl: '' } });
});

test('the proof carries the ID token, and the name Apple gives at the first sign-in', async () => {
  const { proofFromLogin } = await import('../../lib/native-shell.ts');
  assert.deepEqual(proofFromLogin('google', { idToken: ' g.t.k ' }), { provider: 'google', idToken: 'g.t.k' });
  assert.deepEqual(proofFromLogin('apple', { idToken: 'a.t.k', profile: { givenName: ' Ayesha ', familyName: 'Khan' } }), {
    provider: 'apple',
    identityToken: 'a.t.k',
    fullName: 'Ayesha Khan',
  });
  assert.deepEqual(proofFromLogin('apple', { idToken: 'a.t.k', profile: { givenName: null, familyName: null } }), { provider: 'apple', identityToken: 'a.t.k' });
  assert.equal(proofFromLogin('google', { idToken: null }), null);
  assert.equal(proofFromLogin('apple', {}), null);
});

test('the push token comes from the registration event, and a failure or silence rejects', async () => {
  const { nativePushToken } = await import('../../lib/native-shell.ts');
  type Cb = (e: unknown) => void;
  const phone = (answer: (listeners: Record<string, Cb>) => void) => {
    const listeners: Record<string, Cb> = {};
    let removed = 0;
    const plugin = {
      checkPermissions: async () => ({ receive: 'granted' }),
      requestPermissions: async () => ({ receive: 'granted' }),
      register: async () => answer(listeners),
      addListener: async (event: string, cb: Cb) => {
        listeners[event] = cb;
        return { remove: async () => void removed++ };
      },
    };
    return { plugin: plugin as unknown as Parameters<typeof nativePushToken>[0], removed: () => removed };
  };

  const ok = phone((l) => l.registration({ value: 'fcm-token-1' }));
  assert.equal(await nativePushToken(ok.plugin), 'fcm-token-1');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(ok.removed(), 2, 'both listeners are removed afterwards');

  await assert.rejects(nativePushToken(phone((l) => l.registrationError({ error: 'no Play services' })).plugin), /no Play services/);
  await assert.rejects(nativePushToken(phone((l) => l.registration({ value: '' })).plugin), /empty/);
  await assert.rejects(nativePushToken(phone(() => undefined).plugin, 20), /no push token/);
});

test("a listener is removed whether addListener returned its handle (the app's bridge) or a promise of it", async () => {
  const { removeListener } = await import('../../lib/native-shell.ts');
  let removed = 0;
  const handle = { remove: async () => void removed++ };
  removeListener(handle);
  removeListener(Promise.resolve(handle));
  removeListener({ remove: async () => Promise.reject(new Error('already gone')) });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(removed, 2);
});

test('a tapped notification opens only a path on this site', async () => {
  const { notificationPath } = await import('../../lib/native-shell.ts');
  assert.equal(notificationPath({ url: '/seller/orders/12' }), '/seller/orders/12');
  assert.equal(notificationPath({ url: 'https://evil.example/x' }), null);
  assert.equal(notificationPath({ url: '//evil.example/x' }), null);
  assert.equal(notificationPath({ url: '/\\evil.example' }), null);
  assert.equal(notificationPath({ url: 42 }), null);
  assert.equal(notificationPath(undefined), null);
});

test("the rider's background location answer is read safely", async () => {
  const { backgroundLocationChoice, BACKGROUND_LOCATION_CHOICE } = await import('../../lib/native-shell.ts');
  const store = (value: string | null) => ({ getItem: (k: string) => (k === BACKGROUND_LOCATION_CHOICE ? value : null) });
  assert.equal(backgroundLocationChoice(store('yes')), 'yes');
  assert.equal(backgroundLocationChoice(store('no')), 'no');
  assert.equal(backgroundLocationChoice(store('maybe')), null);
  assert.equal(backgroundLocationChoice(store(null)), null);
  assert.equal(backgroundLocationChoice(null), null);
  assert.equal(backgroundLocationChoice({ getItem: () => { throw new Error('blocked'); } }), null);
});

test('API paths become absolute for the phone', async () => {
  const { absoluteApiUrl } = await import('../../lib/native-shell.ts');
  assert.equal(absoluteApiUrl('https://api.nuray.pk/api/v1', '/riders/deliveries/d1/location', 'https://nuray.pk'), 'https://api.nuray.pk/api/v1/riders/deliveries/d1/location');
  assert.equal(absoluteApiUrl('/api/v1/', '/riders/deliveries/d1/location', 'https://nuray.pk'), 'https://nuray.pk/api/v1/riders/deliveries/d1/location');
});
