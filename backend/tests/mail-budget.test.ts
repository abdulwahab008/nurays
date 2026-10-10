/**
 * One inbox only gets so many verification e-mails an hour, whoever asks and however the address is written.
 */
import { assertVerifyMailAllowed, mailboxKey, VERIFY_MAILS_PER_ADDRESS_PER_HOUR } from '../src/utils/mailBudget';

describe('mailboxKey', () => {
  it('is one key for the same inbox written differently', () => {
    const key = mailboxKey('victim@example.com');
    expect(mailboxKey('  Victim@Example.com ')).toBe(key);
    expect(mailboxKey('victim+one@example.com')).toBe(key);
    expect(mailboxKey('victim+two@example.com')).toBe(key);
  });

  it('ignores dots and tags for Gmail only', () => {
    expect(mailboxKey('a.b.c+tag@gmail.com')).toBe(mailboxKey('abc@gmail.com'));
    expect(mailboxKey('abc@googlemail.com')).toBe(mailboxKey('abc@gmail.com'));
    expect(mailboxKey('a.b@example.com')).not.toBe(mailboxKey('ab@example.com'));
  });

  it('keeps different inboxes apart, and never contains the address', () => {
    expect(mailboxKey('one@example.com')).not.toBe(mailboxKey('two@example.com'));
    expect(mailboxKey('someone@example.com')).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('assertVerifyMailAllowed', () => {
  it('allows three an hour to one inbox, however it is written, and then answers 429', async () => {
    expect(VERIFY_MAILS_PER_ADDRESS_PER_HOUR).toBe(3);
    await assertVerifyMailAllowed('target@example.com');
    await assertVerifyMailAllowed('Target+1@Example.com');
    await assertVerifyMailAllowed('target+2@example.com');
    await expect(assertVerifyMailAllowed('target+3@example.com')).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
  });

  it('does not touch another inbox', async () => {
    await expect(assertVerifyMailAllowed('someone-else@example.com')).resolves.toBeUndefined();
  });
});
