// Draws the store apps' launcher icons and splash screens from the SVGs in mobile/assets.
//   cd mobile && node scripts/make-icons.mjs
// sharp is borrowed from frontend-web (Next.js installs it there), so run `npm ci` in frontend-web first.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const sharp = createRequire(path.resolve(mobile, '../frontend-web/package.json'))('sharp');

const asset = (name) => path.join(mobile, 'assets', name);
const res = path.join(mobile, 'android/app/src/main/res');
const ios = path.join(mobile, 'ios/App/App/Assets.xcassets');

// The splash background is the website's page colour, so the app opens on the same colour it then shows.
const SPLASH_BG = '#F5F8F7';

// Each SVG is rasterised at twice the size it is wanted at, then scaled down, so edges stay sharp at every size.
async function png(svg, size) {
  const { width } = await sharp(asset(svg)).metadata();
  return sharp(asset(svg), { density: Math.ceil((72 * size * 2) / width) }).resize(size, size).png();
}

// The mark centred on the page colour, a quarter of the shorter side wide.
async function splash(w, h, file) {
  const size = Math.round(Math.min(w, h) / 4);
  const mark = await (await png('mark.svg', size)).toBuffer();
  await sharp({ create: { width: w, height: h, channels: 3, background: SPLASH_BG } })
    .composite([{ input: mark, left: Math.round((w - size) / 2), top: Math.round((h - size) / 2) }])
    .removeAlpha()
    .png()
    .toFile(file);
}

async function android() {
  // Launcher icon sizes per density: legacy icons are 48 dp, adaptive layers 108 dp.
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(densities)) {
    const dir = path.join(res, `mipmap-${d}`);
    mkdirSync(dir, { recursive: true });
    // The legacy square icon keeps the mark's rounded corners; Android shows it as drawn.
    await (await png('mark.svg', 48 * k)).toFile(path.join(dir, 'ic_launcher.png'));
    await (await png('icon-round.svg', 48 * k)).toFile(path.join(dir, 'ic_launcher_round.png'));
    await (await png('icon-foreground.svg', 108 * k)).toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }
  // Splash for Android 11 and older (12 and newer show the adaptive icon on the theme's splash colour).
  const sizes = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
  for (const [d, [w, h]] of Object.entries(sizes)) {
    await splash(w, h, path.join(res, `drawable-port-${d}`, 'splash.png'));
    await splash(h, w, path.join(res, `drawable-land-${d}`, 'splash.png'));
  }
  await splash(480, 320, path.join(res, 'drawable', 'splash.png'));
}

async function iosAssets() {
  // One 1024 icon, no transparency and square corners: iOS rounds the corners itself.
  await (await png('icon.svg', 1024)).flatten({ background: '#41DAC7' }).toFile(path.join(ios, 'AppIcon.appiconset', 'AppIcon-512@2x.png'));
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await splash(2732, 2732, path.join(ios, 'Splash.imageset', name));
  }
}

await android();
await iosAssets();
console.log('icons and splash screens written');
