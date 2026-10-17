/**
 * The shape of the accounts customers pay into and kitchens are paid out to, checked before a form is sent, with the same rules
 * the API applies (backend/src/utils/payoutAccount.ts): a wrong digit pays a stranger. Pure, so the rules are tested without a browser.
 */

const SEPARATORS = /[\s\-()]/g;

/** A mobile wallet number as written in Pakistan (03001234567, 0300-1234567, +92 300 1234567, 923001234567), as 03001234567; null when it is not one. */
export function normalizeWalletNumber(input: string): string | null {
  const match = /^(?:\+92|0092|92|0)(3\d{9})$/.exec(input.replace(SEPARATORS, ''));
  return match ? `0${match[1]}` : null;
}

/** An IBAN's check digits: the number made of the letters (A=10 … Z=35) and digits, moved four places, leaves 1 when divided by 97. */
function ibanChecksumHolds(iban: string): boolean {
  const moved = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of moved) {
    const value = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** A Pakistani IBAN (check digits verified) or a local account number of 8 to 20 digits, in capitals without spaces or dashes; null when it is neither. */
export function normalizeBankAccount(input: string): string | null {
  const compact = input.replace(SEPARATORS, '').toUpperCase();
  if (/^PK/.test(compact)) return /^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(compact) && ibanChecksumHolds(compact) ? compact : null;
  return /^\d{8,20}$/.test(compact) ? compact : null;
}

export type PayoutMethod = 'bank_transfer' | 'jazzcash' | 'easypaisa';

/** Typed text that is not blank and not a mobile wallet number (a blank number means none, and is allowed). */
export const walletNumberIsWrong = (input: string): boolean => input.trim() !== '' && normalizeWalletNumber(input) === null;

/** Typed text that is not blank and not an IBAN or account number. */
export const bankAccountIsWrong = (input: string): boolean => input.trim() !== '' && normalizeBankAccount(input) === null;

/** Whether the account typed for a payout request does not suit the way the money is being sent. A blank one is wrong here: the request needs it. */
export const payoutDestinationIsWrong = (method: PayoutMethod, input: string): boolean =>
  (method === 'bank_transfer' ? normalizeBankAccount(input) : normalizeWalletNumber(input)) === null;
