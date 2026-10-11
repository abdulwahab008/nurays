/**
 * Where money goes. Customers are told to send their payment to the JazzCash / EasyPaisa number or bank account a kitchen
 * typed in, and the platform pays a kitchen out to the account it names in a payout request. One wrong digit sends
 * someone's money to a stranger, so the shape is checked before anything is saved, and every number is kept in one form.
 */

const SEPARATORS = /[\s\-()]/g;

/**
 * A mobile wallet number as people in Pakistan write it: 03001234567, 0300-1234567, +92 300 1234567, 923001234567 or
 * 00923001234567. Returns it as 03001234567, or null when it is not a Pakistani mobile number.
 */
export function normalizeWalletNumber(input: string): string | null {
  const digits = input.replace(SEPARATORS, '');
  const match = /^(?:\+92|0092|92|0)(3\d{9})$/.exec(digits);
  return match ? `0${match[1]}` : null;
}

/** An IBAN's check digits: the number made of the letters (A=10 … Z=35) and digits, moved four places, must leave 1 when divided by 97. */
function ibanChecksumHolds(iban: string): boolean {
  const moved = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of moved) {
    const value = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/**
 * A bank account: a Pakistani IBAN (PK + two check digits + four letters + sixteen letters or digits, check digits
 * verified so a mistyped digit is caught) or a local account number of 8 to 20 digits. Spaces and dashes are ignored.
 * Returns it in capitals with neither, or null when it is neither of the two.
 */
export function normalizeBankAccount(input: string): string | null {
  const compact = input.replace(SEPARATORS, '').toUpperCase();
  if (/^PK/.test(compact)) return /^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(compact) && ibanChecksumHolds(compact) ? compact : null;
  return /^\d{8,20}$/.test(compact) ? compact : null;
}

/** What to tell the person who typed a number that is not one. */
export const WALLET_NUMBER_HINT = 'Enter a Pakistani mobile number such as 03001234567';
export const BANK_ACCOUNT_HINT = 'Enter an IBAN such as PK36SCBL0000001123456702, or an account number of 8 to 20 digits';

export type PayoutMethod = 'bank_transfer' | 'jazzcash' | 'easypaisa';

/** The account for a payout request, in its one form, or null when it does not suit the way the money is being sent. */
export function normalizePayoutDestination(method: PayoutMethod, input: string): string | null {
  return method === 'bank_transfer' ? normalizeBankAccount(input) : normalizeWalletNumber(input);
}

/**
 * The same account written two ways is still the same account: "0300-1234567" and "+923001234567" are one number, and so
 * are an IBAN with and without spaces. Used to tell whether a save changes anything. A value that is not of the kind (one
 * kept from before the numbers were checked) is compared as typed, ignoring case, spaces and dashes.
 */
export function sameAccount(kind: 'wallet' | 'bank', a: string | null | undefined, b: string | null | undefined): boolean {
  const normalize = kind === 'wallet' ? normalizeWalletNumber : normalizeBankAccount;
  const canon = (value: string | null | undefined) => {
    const text = (value ?? '').trim();
    return text ? normalize(text) ?? text.replace(SEPARATORS, '').toUpperCase() : '';
  };
  return canon(a) === canon(b);
}

export type PayoutField =
  | 'jazzcashNumber'
  | 'jazzcashAccountTitle'
  | 'easypaisaNumber'
  | 'easypaisaAccountTitle'
  | 'bankAccountName'
  | 'bankAccountNumber'
  | 'bankName';

const TITLE_FIELDS = ['jazzcashAccountTitle', 'easypaisaAccountTitle', 'bankAccountName', 'bankName'] as const;

/**
 * What a save of the payout details really changes, written as it will be stored, and what is wrong with a number that
 * changes. Only what differs from what is stored counts: a value the kitchen already has is left alone, even one saved
 * before the numbers were checked, so saving something unrelated never trips over an old value. A blank clears the field (null).
 */
export function changedPayoutDetails(
  stored: Record<PayoutField, string | null | undefined>,
  typed: Partial<Record<PayoutField, string | null | undefined>>
): { changes: Partial<Record<PayoutField, string | null>>; problems: Array<{ field: PayoutField; message: string }> } {
  const changes: Partial<Record<PayoutField, string | null>> = {};
  const problems: Array<{ field: PayoutField; message: string }> = [];

  const number = (field: 'jazzcashNumber' | 'easypaisaNumber' | 'bankAccountNumber', kind: 'wallet' | 'bank') => {
    const value = typed[field];
    if (value === undefined || sameAccount(kind, value, stored[field])) return;
    const text = (value ?? '').trim();
    const clean = text ? (kind === 'wallet' ? normalizeWalletNumber(text) : normalizeBankAccount(text)) : null;
    if (text && !clean) problems.push({ field, message: kind === 'wallet' ? WALLET_NUMBER_HINT : BANK_ACCOUNT_HINT });
    else changes[field] = clean;
  };
  number('jazzcashNumber', 'wallet');
  number('easypaisaNumber', 'wallet');
  number('bankAccountNumber', 'bank');

  for (const field of TITLE_FIELDS) {
    const value = typed[field];
    if (value === undefined) continue;
    const text = value?.trim() || null;
    if (text !== (stored[field]?.trim() || null)) changes[field] = text;
  }
  return { changes, problems };
}
