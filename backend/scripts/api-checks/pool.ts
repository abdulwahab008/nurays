/**
 * Who hears about jobs in the open pool. A job nobody could be given automatically is announced to the
 * riders who can take it (approved, active, on duty) and to no one else: a rider who is off duty cannot claim
 * it, so telling them would only make their dashboard reload. Going on duty puts a rider in at once, going off
 * takes them out (on every connection they have), a connection that opens while they are on duty is in from the
 * start, and an approval or a suspension changes it without a reconnect. Real sockets; the API must run with
 * automatic assignment off, or the jobs would never reach the pool.
 */
import { io, Socket } from 'socket.io-client';
import { acceptOrder, Actor, claimJob, makeRider, makeUser, ok, ORIGIN, placeHomeOrder, prisma, sleep, unique } from './lib';

type Heard = Array<{ event: string; data: any }>;

/** A signed-in socket and everything it hears. The server places a rider's connection after reading their standing, so give it a moment. */
async function connect(token: string, opened: Socket[]): Promise<Heard> {
  const heard: Heard = [];
  const socket = io(ORIGIN, { auth: { token }, transports: ['websocket'], timeout: 5000, reconnection: false });
  opened.push(socket);
  socket.onAny((event: string, data: any) => heard.push({ event, data }));
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
  await sleep(800);
  return heard;
}

/** A customer orders and the kitchen accepts: with automatic assignment off, the job waits in the open pool. */
async function postJob(): Promise<string> {
  const placed = await placeHomeOrder();
  const jobId = await acceptOrder(placed);
  if (!jobId) throw new Error('accepting the order made no rider job');
  return jobId;
}

const told = (heard: Heard, jobId: string, event = 'delivery:new') => heard.some((h) => h.event === event && h.data?.deliveryId === jobId);

/** Wait until the condition holds (up to a few seconds), then a moment longer so a wrong message would have arrived too. */
async function settle(condition: () => boolean) {
  for (let waited = 0; !condition() && waited < 4000; waited += 100) await sleep(100);
  await sleep(1000);
}

const duty = (rider: Actor, isAvailable: boolean) => rider.as('PATCH', '/riders/duty-status', { isAvailable });

export default async function pool() {
  const opened: Socket[] = [];
  try {
    const a = await makeRider();
    const b = await makeRider();
    const c = await makeRider();
    await duty(c, false);
    // A rider whose application is still pending: on duty by default, but not approved.
    const pendingUser = await makeUser('rider');
    const pending = await prisma.rider.create({ data: { userId: pendingUser.id, city: 'Karachi', verificationStatus: 'pending', status: 'active', isAvailable: true } as any });

    const heardA = await connect(a.access, opened);
    const heardB = await connect(b.access, opened);
    const heardC = await connect(c.access, opened);
    const heardPending = await connect(pendingUser.access, opened);

    // 1. who hears a new job
    const first = await postJob();
    await settle(() => told(heardA, first) && told(heardB, first));
    ok('riders on duty are told about a job in the pool', told(heardA, first) && told(heardB, first));
    ok('a rider who is off duty is not', !told(heardC, first));
    ok('nor a rider whose application is still pending', !told(heardPending, first));

    // 2. who hears it taken
    const claimed = await claimJob(a, first);
    ok('a rider on duty takes it', claimed.status === 200, claimed.code);
    await settle(() => told(heardB, first, 'delivery:removed'));
    ok('it leaves the list of the other riders on duty', told(heardB, first, 'delivery:removed'));
    ok('and the rider who is off duty hears nothing about it', !told(heardC, first, 'delivery:removed'));

    // 3. going on duty
    const on = await duty(c, true);
    ok('a rider goes on duty', on.status === 200 && on.body?.data?.isAvailable === true, on.code);
    await sleep(500);
    const second = await postJob();
    await settle(() => told(heardC, second));
    ok('and hears about the next job without reconnecting', told(heardC, second));

    // 4. going off duty
    ok('a rider goes off duty', (await duty(b, false)).status === 200);
    await sleep(500);
    const third = await postJob();
    await settle(() => told(heardA, third) && told(heardC, third));
    ok('the riders still on duty hear about the next job', told(heardA, third) && told(heardC, third));
    ok('the one who went off duty does not', !told(heardB, third));

    // 5. every connection of a rider follows the switch (a second tab, a second phone)
    const heardB2 = await connect(b.access, opened);
    await duty(b, true);
    await sleep(500);
    const fourth = await postJob();
    await settle(() => told(heardB, fourth) && told(heardB2, fourth));
    ok('every connection of a rider who goes on duty hears about the next job', told(heardB, fourth) && told(heardB2, fourth));
    await duty(b, false);
    await sleep(500);
    const fifth = await postJob();
    await settle(() => told(heardA, fifth));
    ok('and none of them once they go off duty', told(heardA, fifth) && !told(heardB, fifth) && !told(heardB2, fifth));

    // 6. a connection that opens while the rider is on duty
    const heardA2 = await connect(a.access, opened);
    const sixth = await postJob();
    await settle(() => told(heardA, sixth) && told(heardA2, sixth));
    ok('a connection that opens while the rider is on duty is told about jobs from the start', told(heardA2, sixth));

    // 7. approval: the rider was on duty by default, and is told from the moment the application is approved
    const admin = await makeUser('admin');
    await prisma.rider.update({ where: { id: pending.id }, data: { vehicleType: 'motorcycle', vehicleNumber: `CHK-${unique()}` } });
    for (const documentType of ['cnic_front', 'cnic_back', 'license']) {
      await prisma.riderDocument.create({ data: { riderId: pending.id, documentType, documentUrl: 'private/check.jpg' } });
    }
    const approved = await admin.as('POST', `/admin/riders/${pending.id}/approve`, { approved: true });
    ok('an admin approves the pending application', approved.status === 200, approved.code);
    await sleep(500);
    const seventh = await postJob();
    await settle(() => told(heardPending, seventh));
    ok('the approved rider is told about the next job without reconnecting', told(heardPending, seventh));

    // 8. suspension takes a rider out; reactivation alone does not put them back (they are still off duty)
    const suspended = await admin.as('POST', `/admin/riders/${c.riderId}/status`, { status: 'suspended' });
    ok('an admin suspends a rider', suspended.status === 200, suspended.code);
    await sleep(500);
    const eighth = await postJob();
    await settle(() => told(heardA, eighth));
    ok('a suspended rider is not told about jobs', told(heardA, eighth) && !told(heardC, eighth));
    const reactivated = await admin.as('POST', `/admin/riders/${c.riderId}/status`, { status: 'active' });
    ok('an admin reactivates them', reactivated.status === 200, reactivated.code);
    await sleep(500);
    const ninth = await postJob();
    await settle(() => told(heardA, ninth));
    ok('they stay out until they switch on duty again', told(heardA, ninth) && !told(heardC, ninth));
    await duty(c, true);
    await sleep(500);
    const tenth = await postJob();
    await settle(() => told(heardC, tenth));
    ok('and are told again as soon as they do', told(heardC, tenth));
  } finally {
    opened.forEach((socket) => socket.close());
  }
}
