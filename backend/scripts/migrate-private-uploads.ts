/**
 * One-off: move files that must be private out of the public uploads folder.
 *
 * Before the storage layer, payment receipts were saved next to product photos in
 * <uploads>/products and served publicly, and voice notes were stored inline in the
 * database as data: URLs. This moves:
 *   - orders.payment_proof_url  "/uploads/products/..."  -> private storage (receipts)
 *   - order_messages.media_url  "/uploads/products/..."  -> private storage (chat)
 *   - order_messages.media_url  "data:audio/...;base64," -> private storage (chat)
 * and rewrites the database to the private references. Originals are deleted
 * after the copy succeeds. Safe to re-run (already-moved rows are skipped).
 *
 *   npx ts-node scripts/migrate-private-uploads.ts            # dry run
 *   npx ts-node scripts/migrate-private-uploads.ts --apply    # do it
 *
 * Uses the configured STORAGE_DRIVER, so run it with production storage settings.
 */
import fs from 'fs';
import path from 'path';
import prisma from '../src/config/database';
import { legacyUploadsDir } from '../src/services/upload.service';
import { storePrivateImage, storePrivateAudio } from '../src/services/media.service';

const apply = process.argv.includes('--apply');

function legacyFile(url: string): string | null {
  const m = url.match(/^\/uploads\/products\/([A-Za-z0-9._-]+)$/);
  if (!m) return null;
  const file = path.join(legacyUploadsDir, m[1]);
  return fs.existsSync(file) ? file : null;
}

async function main() {
  let moved = 0, missing = 0, failed = 0;

  const orders = await prisma.order.findMany({
    where: { paymentProofUrl: { startsWith: '/uploads/' } },
    select: { id: true, customerId: true, paymentProofUrl: true },
  });
  for (const o of orders) {
    const file = legacyFile(o.paymentProofUrl!);
    if (!file) { missing++; console.warn(`order ${o.id}: receipt file not found (${o.paymentProofUrl})`); continue; }
    if (!apply) { moved++; continue; }
    try {
      const stored = await storePrivateImage('proofs', o.customerId ?? 'unknown', await fs.promises.readFile(file));
      await prisma.order.update({ where: { id: o.id }, data: { paymentProofUrl: stored.ref } });
      await fs.promises.rm(file, { force: true });
      moved++;
    } catch (err) {
      failed++;
      console.error(`order ${o.id}: ${(err as Error).message}`);
    }
  }

  const messages = await prisma.orderMessage.findMany({
    where: { OR: [{ mediaUrl: { startsWith: '/uploads/' } }, { mediaUrl: { startsWith: 'data:' } }] },
    select: { id: true, senderId: true, mediaUrl: true },
  });
  for (const m of messages) {
    const url = m.mediaUrl!;
    let buffer: Buffer | null = null;
    let file: string | null = null;
    if (url.startsWith('data:')) {
      const b64 = url.split(',', 2)[1];
      buffer = b64 ? Buffer.from(b64, 'base64') : null;
    } else {
      file = legacyFile(url);
      buffer = file ? await fs.promises.readFile(file) : null;
    }
    if (!buffer) { missing++; console.warn(`message ${m.id}: media not found`); continue; }
    if (!apply) { moved++; continue; }
    try {
      const isAudio = url.startsWith('data:audio') || /\.(webm|ogg|mp3|m4a|wav)$/i.test(url);
      const stored = isAudio
        ? await storePrivateAudio('chat', m.senderId, buffer)
        : await storePrivateImage('chat', m.senderId, buffer);
      await prisma.orderMessage.update({ where: { id: m.id }, data: { mediaUrl: stored.ref } });
      if (file) await fs.promises.rm(file, { force: true });
      moved++;
    } catch (err) {
      failed++;
      console.error(`message ${m.id}: ${(err as Error).message}`);
    }
  }

  console.log(`${apply ? 'Moved' : 'Would move'} ${moved} file(s); ${missing} missing; ${failed} failed.`);
  if (!apply) console.log('Dry run only. Re-run with --apply to move them.');
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
