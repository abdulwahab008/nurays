/**
 * The password-reset job makes the link and then mails it. When the mail fails, the link must go, or the queue's retry
 * finds it, takes it for one "sent in the last minute", and sends nothing: the person asked and never got a link.
 */
type Handler = (payload: { userId: string }) => Promise<void>;
const handlers = new Map<string, Handler>();
jest.mock('../src/jobs/queue', () => ({ defineJob: (name: string, handler: Handler) => handlers.set(name, handler) }));

const links: Array<{ id: string }> = [];
const db = {
  user: { findUnique: jest.fn(async () => ({ email: 'a@t.test', status: 'active', emailVerified: true, profile: { fullName: 'A' } })) },
  passwordReset: {
    findFirst: jest.fn(async () => links[0] ?? null),
    deleteMany: jest.fn(async ({ where }: { where: { id?: string } }) => {
      if (where.id) links.splice(0, links.length, ...links.filter((l) => l.id !== where.id));
      else links.length = 0;
    }),
    create: jest.fn(async () => {
      const link = { id: `link-${links.length + 1}-${handlers.size}` };
      links.push(link);
      return link;
    }),
  },
  $transaction: jest.fn(async (steps: Array<Promise<unknown>>) => Promise.all(steps)),
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
const send = jest.fn();
jest.mock('../src/services/email.service', () => ({ __esModule: true, default: { sendPasswordResetEmail: send, sendVerificationEmail: jest.fn(), sendEmail: jest.fn() } }));

import '../src/jobs/email.jobs';

it('a failed send leaves no link behind, so the retry sends a fresh one', async () => {
  const job = handlers.get('email.password-reset')!;
  send.mockRejectedValueOnce(new Error('EMAIL_SEND_FAILED'));
  await expect(job({ userId: 'u1' })).rejects.toThrow('EMAIL_SEND_FAILED');
  expect(links).toHaveLength(0);

  send.mockResolvedValueOnce(undefined);
  await job({ userId: 'u1' });
  expect(send).toHaveBeenCalledTimes(2);
  expect(links).toHaveLength(1);

  // asking again within the minute keeps the link that did go out
  await job({ userId: 'u1' });
  expect(send).toHaveBeenCalledTimes(2);
});
