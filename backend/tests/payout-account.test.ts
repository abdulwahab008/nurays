import { BANK_ACCOUNT_HINT, WALLET_NUMBER_HINT, changedPayoutDetails, normalizeBankAccount, normalizePayoutDestination, normalizeWalletNumber, sameAccount } from '../src/utils/payoutAccount';

// Customers are told to pay into the numbers a kitchen types, and the platform pays a kitchen out to the account it
// names. One wrong digit sends someone's money to a stranger, so what is typed has to be a real number, in one form.

// A real Pakistani IBAN (the registry's example). The same with one digit changed must not pass.
const IBAN = 'PK36SCBL0000001123456702';

describe('mobile wallet numbers (JazzCash, EasyPaisa)', () => {
  it.each([
    ['03001234567', '03001234567'],
    ['0300-1234567', '03001234567'],
    ['0300 123 4567', '03001234567'],
    ['+923001234567', '03001234567'],
    ['+92 300 1234567', '03001234567'],
    ['+92-300-1234567', '03001234567'],
    ['923001234567', '03001234567'],
    ['00923001234567', '03001234567'],
    ['(0300) 1234567', '03001234567'],
    ['  03451234567  ', '03451234567'],
  ])('reads %s as %s', (typed, stored) => {
    expect(normalizeWalletNumber(typed)).toBe(stored);
  });

  it.each([
    ['', 'nothing'],
    ['0300123456', 'one digit short'],
    ['030012345678', 'one digit too many'],
    ['02001234567', 'a landline-style prefix'],
    ['+913001234567', 'another country'],
    ['0300-ABCDEFG', 'letters'],
    ['0300 1234567 ext 4', 'extra text'],
    ['PK36SCBL0000001123456702', 'an IBAN'],
    ['3001234567', 'no leading zero or country code'],
  ])('refuses %s (%s)', (typed) => {
    expect(normalizeWalletNumber(typed)).toBeNull();
  });
});

describe('bank accounts', () => {
  it('accepts an IBAN whose check digits hold, written with or without spaces, in any case', () => {
    expect(normalizeBankAccount(IBAN)).toBe(IBAN);
    expect(normalizeBankAccount('pk36 scbl 0000 0011 2345 6702')).toBe(IBAN);
    expect(normalizeBankAccount('PK36-SCBL-0000-0011-2345-6702')).toBe(IBAN);
  });

  it('refuses an IBAN with a mistyped digit, the wrong length or the wrong shape', () => {
    expect(normalizeBankAccount('PK36SCBL0000001123456703')).toBeNull();
    expect(normalizeBankAccount('PK36SCBL000000112345670')).toBeNull();
    expect(normalizeBankAccount('PK36SCBL00000011234567022')).toBeNull();
    expect(normalizeBankAccount('PK36S1BL0000001123456702')).toBeNull();
    expect(normalizeBankAccount('PK00HABB0000000000000000')).toBeNull();
    expect(normalizeBankAccount('GB82WEST12345698765432')).toBeNull();
  });

  it('accepts a local account number of 8 to 20 digits, with spaces or dashes', () => {
    expect(normalizeBankAccount('12345678')).toBe('12345678');
    expect(normalizeBankAccount('0123-4567-8901-2345')).toBe('0123456789012345');
    expect(normalizeBankAccount('12345678901234567890')).toBe('12345678901234567890');
  });

  it('refuses anything shorter, longer, or not digits', () => {
    for (const bad of ['', '1234567', '123456789012345678901', '1234abcd5678', 'account', '0300-1234567x']) expect(normalizeBankAccount(bad)).toBeNull();
  });
});

describe('the account of a payout request', () => {
  it('follows the way the money is sent', () => {
    expect(normalizePayoutDestination('jazzcash', '+92 300 1234567')).toBe('03001234567');
    expect(normalizePayoutDestination('easypaisa', '0345-1234567')).toBe('03451234567');
    expect(normalizePayoutDestination('bank_transfer', 'pk36 scbl 0000 0011 2345 6702')).toBe(IBAN);
    expect(normalizePayoutDestination('bank_transfer', '03001234567')).toBe('03001234567');
    expect(normalizePayoutDestination('jazzcash', IBAN)).toBeNull();
    expect(normalizePayoutDestination('bank_transfer', '1')).toBeNull();
    expect(normalizePayoutDestination('easypaisa', '1')).toBeNull();
  });
});

describe('the same account written two ways', () => {
  it('is the same account', () => {
    expect(sameAccount('wallet', '0300-1234567', '+923001234567')).toBe(true);
    expect(sameAccount('wallet', '03001234567', ' 0300 123 4567')).toBe(true);
    expect(sameAccount('bank', IBAN, 'pk36 scbl 0000 0011 2345 6702')).toBe(true);
    expect(sameAccount('wallet', '', null)).toBe(true);
    expect(sameAccount('bank', undefined, '   ')).toBe(true);
  });

  it('is not when a digit differs, or one is blank', () => {
    expect(sameAccount('wallet', '03001234567', '03001234568')).toBe(false);
    expect(sameAccount('wallet', '03001234567', '')).toBe(false);
    expect(sameAccount('bank', null, IBAN)).toBe(false);
  });

  it('compares an old value that is not of the kind as typed, ignoring case, spaces and dashes', () => {
    expect(sameAccount('bank', 'pk00bank000000', 'PK00 BANK-000000')).toBe(true);
    expect(sameAccount('bank', 'PK00BANK000000', 'PK00BANK000001')).toBe(false);
  });

  it('does not take a long bank account number for a mobile number', () => {
    expect(sameAccount('bank', '923001234567', '03001234567')).toBe(false);
  });
});

const NONE = { jazzcashNumber: null, jazzcashAccountTitle: null, easypaisaNumber: null, easypaisaAccountTitle: null, bankAccountName: null, bankAccountNumber: null, bankName: null };

describe('what a save of the payout details changes', () => {
  it('is nothing when the request has none of them', () => {
    expect(changedPayoutDetails({ ...NONE, jazzcashNumber: '03001234567' }, {})).toEqual({ changes: {}, problems: [] });
  });

  it('is nothing when the settings page sends back what it was given, however it is written', () => {
    const stored = { ...NONE, jazzcashNumber: '0300-1234567', bankAccountNumber: IBAN, bankName: 'Standard Chartered', bankAccountName: 'Zainab Bukhari' };
    const sent = { jazzcashNumber: '+923001234567', bankAccountNumber: IBAN.toLowerCase(), bankName: ' Standard Chartered ', bankAccountName: 'Zainab Bukhari', easypaisaNumber: '', jazzcashAccountTitle: '' };
    expect(changedPayoutDetails(stored, sent)).toEqual({ changes: {}, problems: [] });
  });

  it('leaves an old value that would not pass today alone, so saving something else never trips over it', () => {
    const stored = { ...NONE, bankAccountNumber: 'PK00BANK000000', jazzcashNumber: '0300-ABC' };
    expect(changedPayoutDetails(stored, { bankAccountNumber: 'PK00BANK000000', jazzcashNumber: '0300-ABC' })).toEqual({ changes: {}, problems: [] });
  });

  it('gives a changed number in the form it will be stored', () => {
    const { changes, problems } = changedPayoutDetails({ ...NONE, jazzcashNumber: '03001234567' }, { jazzcashNumber: '+92 301 7654321', easypaisaNumber: '0345-1234567', bankAccountNumber: 'pk36 scbl 0000 0011 2345 6702' });
    expect(problems).toEqual([]);
    expect(changes).toEqual({ jazzcashNumber: '03017654321', easypaisaNumber: '03451234567', bankAccountNumber: IBAN });
  });

  it('counts a changed title and a number cleared, and clears with null', () => {
    const stored = { ...NONE, jazzcashNumber: '03001234567', jazzcashAccountTitle: 'Zainab', bankName: 'Meezan' };
    expect(changedPayoutDetails(stored, { jazzcashNumber: '', jazzcashAccountTitle: 'Zainab B', bankName: null })).toEqual({
      changes: { jazzcashNumber: null, jazzcashAccountTitle: 'Zainab B', bankName: null },
      problems: [],
    });
  });

  it('names each number that changes to something that is not one, and changes nothing for it', () => {
    const { changes, problems } = changedPayoutDetails({ ...NONE, jazzcashNumber: '03001234567' }, { jazzcashNumber: '12345', bankAccountNumber: 'PK36SCBL0000001123456703', easypaisaNumber: '0345-1234567' });
    expect(problems).toEqual([
      { field: 'jazzcashNumber', message: WALLET_NUMBER_HINT },
      { field: 'bankAccountNumber', message: BANK_ACCOUNT_HINT },
    ]);
    expect(changes).toEqual({ easypaisaNumber: '03451234567' });
  });
});
