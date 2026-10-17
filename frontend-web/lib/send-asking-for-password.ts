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

/**
 * `send` makes the request (with the password when it has one). When the API asks for the password, `ask` puts the question to the
 * person; their answer is sent along in a second request. Resolves undefined when they cancel the question: nothing was done.
 * Every other failure is thrown, a wrong password included (the person starts again).
 */
export async function sendAskingForPassword<T>(send: (password?: string) => Promise<T>, ask: () => Promise<string | null>): Promise<T | undefined> {
  try {
    return await send();
  } catch (error) {
    if (!isPasswordRequired(error)) throw error;
    const password = await ask();
    if (!password) return undefined;
    return send(password);
  }
}
