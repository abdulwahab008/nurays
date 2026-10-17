/**
 * The e-mails that tell a person their own account changed (the password, the e-mail address): what they say, that
 * they never carry more than they should, and that they go only to an address its owner has proven.
 */
jest.mock('../src/jobs/email.jobs', () => ({ queueEmail: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/utils/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

import { queueEmail } from '../src/jobs/email.jobs';
import { logger } from '../src/utils/logger';
import {
  emailChangedNotice,
  notifyEmailChanged,
  notifyPasswordChanged,
  passwordChangedNotice,
  whenInPakistan,
} from '../src/services/account-notice.service';

const queue = queueEmail as jest.Mock;
const AT = new Date('2026-10-10T18:34:00Z'); // 11:34 pm in Pakistan
process.env.FRONTEND_URL = 'https://nuray.example/'; // read when a notice is made, which the describe blocks below do while being collected

beforeEach(() => {
  queue.mockReset().mockResolvedValue(undefined);
  (logger.warn as jest.Mock).mockClear();
});
afterAll(() => {
  delete process.env.FRONTEND_URL;
});

describe('whenInPakistan', () => {
  it('says the time on a Pakistani clock, not the server\'s', () => {
    expect(whenInPakistan(AT)).toMatch(/^10 October 2026 at 11:34\s?pm$/i);
    expect(whenInPakistan(new Date('2026-10-10T19:30:00Z'))).toMatch(/^11 October 2026 at 12:30\s?am$/i); // past midnight there
  });
});

describe('the password-changed notice', () => {
  const notice = passwordChangedNotice({ name: 'Aisha', at: AT });

  it('says what happened and when, and what to do if it was not the owner', () => {
    expect(notice.subject).toBe('Your Nuray password was changed');
    expect(notice.text).toContain('Hi Aisha');
    expect(notice.text).toMatch(/10 October 2026 at 11:34\s?pm \(Pakistan time\)/i);
    expect(notice.text).toContain('Every other device you were signed in on has been signed out');
    expect(notice.text).toContain('https://nuray.example/forgot-password');
    expect(notice.text).toContain('https://nuray.example/help');
    expect(notice.html).toContain('href="https://nuray.example/forgot-password"');
  });

  it('puts a name in as text, never as markup', () => {
    const hostile = passwordChangedNotice({ name: '<img src=x onerror=alert(1)>', at: AT });
    expect(hostile.html).not.toContain('<img');
    expect(hostile.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('the e-mail-changed notice', () => {
  const notice = emailChangedNotice({ name: 'Aisha', newEmail: 'thief@evil.example', at: AT });

  it('names the new address only in part, so the owner can tell whose it is without the notice giving it away', () => {
    expect(notice.subject).toBe('The e-mail address of your Nuray account was changed');
    expect(notice.text).toContain('th***@evil.example');
    expect(notice.text).not.toContain('thief@evil.example');
    expect(notice.html).not.toContain('thief@evil.example');
  });

  it('says when, and where to turn if it was not the owner', () => {
    expect(notice.text).toMatch(/10 October 2026 at 11:34\s?pm \(Pakistan time\)/i);
    expect(notice.text).toContain('https://nuray.example/help');
    expect(notice.html).toContain('href="https://nuray.example/help"');
  });

  it('escapes the name', () => {
    expect(emailChangedNotice({ name: '"><script>1</script>', newEmail: 'a@b.example', at: AT }).html).not.toContain('<script>');
  });
});

describe('who is told', () => {
  it('a verified address is written to, once, with the notice', async () => {
    await notifyPasswordChanged({ email: 'aisha@example.com', emailVerified: true, fullName: 'Aisha Khan' }, AT);
    expect(queue).toHaveBeenCalledTimes(1);
    expect(queue).toHaveBeenCalledWith(expect.objectContaining({ to: 'aisha@example.com', subject: 'Your Nuray password was changed' }));
    expect(queue.mock.calls[0][0].text).toContain('Hi Aisha Khan');
  });

  it('an address nobody has proven is not written to (it may be a stranger\'s), and neither is a missing one', async () => {
    await notifyPasswordChanged({ email: 'typo@example.com', emailVerified: false, fullName: 'A' }, AT);
    await notifyPasswordChanged({ email: null, emailVerified: true, fullName: 'A' }, AT);
    await notifyEmailChanged({ email: 'typo@example.com', emailVerified: false, fullName: 'A' }, 'new@example.com', AT);
    await notifyEmailChanged({ email: undefined, emailVerified: undefined, fullName: 'A' }, 'new@example.com', AT);
    expect(queue).not.toHaveBeenCalled();
  });

  it('the address the account leaves is the one written to, and the notice names the one it moved to', async () => {
    await notifyEmailChanged({ email: 'old@example.com', emailVerified: true, fullName: null }, 'new.address@example.com', AT);
    expect(queue).toHaveBeenCalledWith(expect.objectContaining({ to: 'old@example.com', subject: 'The e-mail address of your Nuray account was changed' }));
    expect(queue.mock.calls[0][0].text).toContain('Hi there');
    expect(queue.mock.calls[0][0].text).toContain('ne***@example.com');
  });

  it('a queue that is down does not fail the change it reports, and the log does not carry the address in full', async () => {
    queue.mockRejectedValue(new Error('redis is down'));
    await expect(notifyPasswordChanged({ email: 'aisha@example.com', emailVerified: true, fullName: 'Aisha' }, AT)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ to: 'ai***@example.com' }), expect.stringContaining('password changed'));
  });
});
