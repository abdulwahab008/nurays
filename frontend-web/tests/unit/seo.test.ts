// Run with `npm test` (Node's own test runner, which reads TypeScript directly: no extra packages).
import test from 'node:test';
import assert from 'node:assert/strict';
import { clip, dishMetadata, kitchenMetadata, NOT_FOUND_METADATA, routeSegment } from '../../lib/seo.ts';
import { absoluteUrl, siteUrl } from '../../lib/site.ts';

const SITE = 'https://nuray.pk';

// ---------------------------------------------------------------------------------------------------- the site's address
test('the site address is the origin of what was configured, and nothing without one', () => {
  assert.equal(siteUrl(undefined), null);
  assert.equal(siteUrl(''), null);
  assert.equal(siteUrl('   '), null);
  assert.equal(siteUrl('https://nuray.pk'), 'https://nuray.pk');
  assert.equal(siteUrl('  https://nuray.pk/  '), 'https://nuray.pk');
  assert.equal(siteUrl('https://nuray.pk/some/path?x=1#y'), 'https://nuray.pk');
  assert.equal(siteUrl('http://localhost:3000'), 'http://localhost:3000');
});

test('a site address that is not a web address is no address', () => {
  assert.equal(siteUrl('nuray.pk'), null);
  assert.equal(siteUrl('ftp://nuray.pk'), null);
  assert.equal(siteUrl('javascript:alert(1)'), null);
  assert.equal(siteUrl('not a url'), null);
});

test('a path on the site is only absolute when the site has an address', () => {
  assert.equal(absoluteUrl('/products/x', null), null);
  assert.equal(absoluteUrl('/products/x', SITE), 'https://nuray.pk/products/x');
  assert.equal(absoluteUrl('products/x', SITE), 'https://nuray.pk/products/x');
});

// ---------------------------------------------------------------------------------------------------- text and parameters
test('a description is cut at a word, never longer than asked, and says it was cut', () => {
  assert.equal(clip('short and sweet', 50), 'short and sweet');
  assert.equal(clip('  many   spaces\n and\tlines  ', 50), 'many spaces and lines');
  assert.equal(clip(null), '');
  assert.equal(clip(undefined), '');
  const cut = clip('Aged basmati rice infused with whole spices and tender chicken, slow cooked on dum', 40);
  assert.equal(cut, 'Aged basmati rice infused with whole…');
  assert.ok(cut.length <= 40);
  assert.equal(clip('a'.repeat(100), 20), `${'a'.repeat(19)}…`, 'one long word is cut where it must be');
  assert.equal(clip('rice, spices, chicken, and more', 22), 'rice, spices, chicken…', 'a word that ends at the cut is kept');
  assert.equal(clip('alpha, beta, gamma delta', 13), 'alpha, beta…', 'no comma is left before the ellipsis');
});

test('only a plain id or slug is taken from the address bar', () => {
  assert.equal(routeSegment('4a1a23e8-8048-4eca-bad1-c2f22f4d0937'), '4a1a23e8-8048-4eca-bad1-c2f22f4d0937');
  assert.equal(routeSegment('special-zafrani-chicken-dum-biryani-lahori--45915'), 'special-zafrani-chicken-dum-biryani-lahori--45915');
  assert.equal(routeSegment('under_score'), 'under_score');
  for (const bad of ['', '..', '../admin', 'a/b', 'a b', '%2e%2e', 'a?b=1', 'a#b', 'x'.repeat(101), undefined, null, 42, ['a']]) {
    assert.equal(routeSegment(bad), null, JSON.stringify(bad));
  }
});

// ---------------------------------------------------------------------------------------------------- a dish
const dish = {
  name: 'Special Zafrani Chicken Dum Biryani',
  description: 'Aged basmati rice infused with whole spices and tender chicken.',
  price: 650,
  unit: 'portion',
  isActive: true,
  approvalStatus: 'approved',
  images: [
    { imageUrl: 'https://cdn.example/second.webp', isPrimary: false },
    { imageUrl: 'https://cdn.example/first.webp', isPrimary: true },
  ],
  seller: { businessName: 'Askari 11 Dum Biryani & Pulao' },
};

test('a dish is described by its name, kitchen, price and photo', () => {
  const m = dishMetadata(dish, '/products/abc', SITE);
  assert.equal(m.title, 'Special Zafrani Chicken Dum Biryani by Askari 11 Dum Biryani & Pulao | Nuray');
  assert.equal(
    m.description,
    'Aged basmati rice infused with whole spices and tender chicken. · Rs 650 per portion · from Askari 11 Dum Biryani & Pulao on Nuray'
  );
  assert.deepEqual(m.alternates, { canonical: 'https://nuray.pk/products/abc' });
  assert.deepEqual(m.robots, { index: true, follow: true });
  assert.equal(m.openGraph?.url, 'https://nuray.pk/products/abc');
  assert.deepEqual((m.openGraph as { images: unknown }).images, [{ url: 'https://cdn.example/first.webp', alt: 'Special Zafrani Chicken Dum Biryani' }], 'the primary photo, not the first listed');
  assert.equal((m.twitter as { card: string }).card, 'summary_large_image');
  assert.deepEqual((m.twitter as { images: unknown }).images, ['https://cdn.example/first.webp']);
});

test('without a site address a dish has no absolute address of its own, and is not offered to search engines', () => {
  const m = dishMetadata(dish, '/products/abc', null);
  assert.equal(m.alternates, undefined);
  assert.equal(m.openGraph?.url, undefined);
  assert.deepEqual(m.robots, { index: false, follow: true });
  assert.equal(m.title, 'Special Zafrani Chicken Dum Biryani by Askari 11 Dum Biryani & Pulao | Nuray');
});

test('prices are written the way the pages write them', () => {
  const price = (p: unknown) => String(dishMetadata({ ...dish, price: p as number, unit: null }, '/p', SITE).description);
  assert.match(price(650), /Rs 650 ·/);
  assert.match(price(99.5), /Rs 99\.50 ·/);
  assert.doesNotMatch(price(null), /Rs/);
  assert.doesNotMatch(price(0), /Rs/, 'a price of nothing is not shown');
  assert.doesNotMatch(price(''), /Rs/);
  assert.doesNotMatch(price(-5), /Rs/);
  assert.doesNotMatch(price('abc'), /Rs/);
});

test('a dish with no photo, no kitchen or no description still has a title and a small card', () => {
  const m = dishMetadata({ name: 'Plain rice' }, '/p', SITE);
  assert.equal(m.title, 'Plain rice | Nuray');
  assert.equal(m.description, 'on Nuray');
  assert.equal((m.openGraph as { images?: unknown }).images, undefined);
  assert.equal((m.twitter as { card: string }).card, 'summary');
});

test('only a photo a browser can load is offered as the preview', () => {
  const images = (imageUrl: string) => (dishMetadata({ name: 'X', images: [{ imageUrl, isPrimary: true }] }, '/p', SITE).openGraph as { images?: unknown[] }).images;
  assert.equal(images('/media/p/products/a-lg.webp'), undefined, 'a relative address');
  assert.equal(images('javascript:alert(1)'), undefined);
  assert.equal(images('data:image/png;base64,AAAA'), undefined);
  assert.equal(images(''), undefined);
  assert.equal(images('http://cdn.example/a.webp')?.length, 1);
});

test('a dish that is not on sale is not offered to search engines, though its link still previews', () => {
  const index = (extra: object) => (dishMetadata({ ...dish, ...extra }, '/p', SITE).robots as { index: boolean }).index;
  assert.equal(index({}), true);
  assert.equal(index({ isActive: false }), false);
  assert.equal(index({ approvalStatus: 'pending' }), false);
  assert.equal(index({ approvalStatus: 'rejected' }), false);
  assert.equal(index({ approvalStatus: null }), true, 'an answer without a status is taken as on sale');
  assert.equal(dishMetadata({ ...dish, isActive: false }, '/p', SITE).openGraph?.title, 'Special Zafrani Chicken Dum Biryani by Askari 11 Dum Biryani & Pulao | Nuray');
});

test('a dish with no name is not a page', () => {
  assert.equal(dishMetadata({}, '/p', SITE), NOT_FOUND_METADATA);
  assert.equal(dishMetadata({ name: '   ' }, '/p', SITE), NOT_FOUND_METADATA);
  assert.deepEqual(NOT_FOUND_METADATA.robots, { index: false, follow: false });
});

// ---------------------------------------------------------------------------------------------------- a kitchen
const kitchen = {
  businessName: 'Askari 11 Dum Biryani & Pulao',
  description: 'Long-grain fragrant dum biryani and yakhni pulao cooked in traditional deg.',
  coverImageUrl: 'https://cdn.example/cover.webp',
  ratingAverage: 4.88,
  totalReviews: 210,
  verificationStatus: 'approved',
  isVerified: true,
  community: { name: 'Askari 11', city: 'Lahore' },
};

test('a kitchen is described by its name, area, rating and cover', () => {
  const m = kitchenMetadata(kitchen, '/kitchens/k1', SITE);
  assert.equal(m.title, 'Askari 11 Dum Biryani & Pulao | home kitchen in Askari 11 on Nuray');
  assert.equal(
    m.description,
    'Long-grain fragrant dum biryani and yakhni pulao cooked in traditional deg. · Askari 11, Lahore · ★ 4.9 (210 reviews)'
  );
  assert.deepEqual(m.alternates, { canonical: 'https://nuray.pk/kitchens/k1' });
  assert.deepEqual(m.robots, { index: true, follow: true });
  assert.deepEqual((m.openGraph as { images: unknown }).images, [{ url: 'https://cdn.example/cover.webp', alt: 'Askari 11 Dum Biryani & Pulao' }]);
});

test('without a site address a kitchen is not offered to search engines either', () => {
  assert.deepEqual(kitchenMetadata(kitchen, '/k', null).robots, { index: false, follow: true });
  assert.equal(kitchenMetadata(kitchen, '/k', null).alternates, undefined);
});

test('a kitchen with one review says "review"; with none, no rating is claimed', () => {
  assert.match(String(kitchenMetadata({ ...kitchen, totalReviews: 1, ratingAverage: 5 }, '/k', SITE).description), /★ 5\.0 \(1 review\)$/);
  assert.doesNotMatch(String(kitchenMetadata({ ...kitchen, totalReviews: 0, ratingAverage: 4.5 }, '/k', SITE).description), /★/);
  assert.doesNotMatch(String(kitchenMetadata({ ...kitchen, totalReviews: 10, ratingAverage: 0 }, '/k', SITE).description), /★/);
  assert.doesNotMatch(String(kitchenMetadata({ businessName: 'K' }, '/k', SITE).description), /★|NaN/);
});

test('a kitchen with no description or no area still reads well', () => {
  const m = kitchenMetadata({ businessName: 'Saima\'s Kitchen' }, '/k', SITE);
  assert.equal(m.title, 'Saima\'s Kitchen | home kitchen on Nuray');
  assert.equal(m.description, 'Home-cooked food from Saima\'s Kitchen');
  const cityOnly = kitchenMetadata({ businessName: 'K', community: { city: 'Lahore' } }, '/k', SITE);
  assert.equal(cityOnly.title, 'K | home kitchen in Lahore on Nuray');
});

test('a kitchen that is not verified is not offered to search engines', () => {
  const index = (extra: object) => (kitchenMetadata({ ...kitchen, ...extra }, '/k', SITE).robots as { index: boolean }).index;
  assert.equal(index({}), true);
  assert.equal(index({ verificationStatus: 'pending' }), false);
  assert.equal(index({ verificationStatus: 'rejected' }), false);
  assert.equal(index({ verificationStatus: undefined, isVerified: false }), false);
  assert.equal(index({ verificationStatus: undefined, isVerified: true }), true);
});

test('a kitchen with no name is not a page', () => {
  assert.equal(kitchenMetadata({}, '/k', SITE), NOT_FOUND_METADATA);
});
