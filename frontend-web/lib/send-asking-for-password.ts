/**
 * Some changes ask for the account password again before the API does them (400 PASSWORD_REQUIRED): where a kitchen's customers
 * pay, where its earnings are sent, the account's e-mail address. The page sends the request, and when the API answers that it
 * needs the password, asks for it and sends the same request again with it. Pure, so it is tested without a browser.
 */

/** Whether an API error is the question "what is your password?". */
export function isPasswordRequired(error: unknown): boolean {
  const code = (error as { response?: { data?: { error?: { code?: unknown } } } } | null | undefined)?.response?.data?.error?.code;
  return code === 'PASSWORD_REQUIRED';
}

/** Whether an API error says the password given was wrong. */
export function isWrongPassword(error: unknown): boolean {
  const code = (error as { response?: { data?: { error?: { code?: unknown } } } } | null | undefined)?.response?.data?.error?.code;
  return code === 'INVALID_PASSWORD';
}

/** How many times a wrong password is asked for again before the failure goes back to the page (the server also locks out). */
export const PASSWORD_TRIES = 3;

/**
 * `send` makes the request (with the password when it has one). When the API asks for the password, `ask` puts the question to the
 * person; their answer is sent along in a second request. A wrong password asks again (`ask(true)`), so the person does not have to
 * start over, up to PASSWORD_TRIES times. Resolves undefined when they cancel the question: nothing was done. Every other failure
 * is thrown, as is the last wrong password.
 */
export async function sendAskingForPassword<T>(
  send: (password?: string) => Promise<T>,
  ask: (wrongBefore: boolean) => Promise<string | null>,
): Promise<T | undefined> {
  try {
    return await send();
  } catch (error) {
    if (!isPasswordRequired(error)) throw error;
  }
  for (let attempt = 1; ; attempt++) {
    const password = await ask(attempt > 1);
    if (!password) return undefined;
    try {
      return await send(password);
    } catch (error) {
      if (!isWrongPassword(error) || attempt >= PASSWORD_TRIES) throw error;
    }
  }
}
