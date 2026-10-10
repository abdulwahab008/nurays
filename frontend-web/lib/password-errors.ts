/** The translate function of the auth messages (lib/i18n/messages/auth.ts) as far as this helper needs it. */
type Translate = (key: 'weakPasswordTooShort' | 'weakPasswordTooLong' | 'weakPasswordCommon' | 'weakPasswordPersonal', vars?: Record<string, string | number>) => string;

/**
 * The API refuses a weak new password with 400 WEAK_PASSWORD and says why in `details.reason`
 * (TOO_SHORT, TOO_LONG, COMMON or PERSONAL). This turns that into a sentence in the person's language,
 * or null when the error is not about a weak password.
 */
export function weakPasswordMessage(err: unknown, t: Translate): string | null {
  const error = (err as { response?: { data?: { error?: { code?: string; details?: { reason?: string; minLength?: number } } } } })?.response?.data?.error;
  if (error?.code !== 'WEAK_PASSWORD') return null;
  switch (error.details?.reason) {
    case 'TOO_SHORT':
      return t('weakPasswordTooShort', { min: error.details.minLength ?? 8 });
    case 'TOO_LONG':
      return t('weakPasswordTooLong');
    case 'COMMON':
      return t('weakPasswordCommon');
    case 'PERSONAL':
      return t('weakPasswordPersonal');
    default:
      return null;
  }
}
