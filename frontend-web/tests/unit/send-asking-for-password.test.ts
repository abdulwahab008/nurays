import test from 'node:test';
import assert from 'node:assert/strict';
import { isPasswordRequired, sendAskingForPassword } from '../../lib/send-asking-for-password.ts';

const apiError = (code: string, status = 400) => ({ response: { status, data: { error: { code, message: code } } } });

test('only the API asking for the password counts as the question', () => {
  assert.equal(isPasswordRequired(apiError('PASSWORD_REQUIRED')), true);
  for (const other of [apiError('INVALID_PASSWORD'), apiError('VALIDATION_ERROR'), apiError('PASSWORD_REQUIRED', 401).response.data, new Error('Network Error'), null, undefined, 'PASSWORD_REQUIRED']) {
    assert.equal(isPasswordRequired(other), false);
  }
});

test('a request the API accepts is sent once and the person is never asked', async () => {
  const sent: Array<string | undefined> = [];
  let asked = 0;
  const result = await sendAskingForPassword(
    async (password) => (sent.push(password), 'saved'),
    async () => (asked++, 'secret')
  );
  assert.equal(result, 'saved');
  assert.deepEqual(sent, [undefined]);
  assert.equal(asked, 0);
});

test('when the API asks for the password, the person is asked and the same request goes again with it', async () => {
  const sent: Array<string | undefined> = [];
  const result = await sendAskingForPassword(
    async (password) => {
      sent.push(password);
      if (!password) throw apiError('PASSWORD_REQUIRED');
      return 'saved';
    },
    async () => 'secret'
  );
  assert.equal(result, 'saved');
  assert.deepEqual(sent, [undefined, 'secret']);
});

test('cancelling the question (or leaving it empty) sends nothing more and says so', async () => {
  for (const answer of [null, '']) {
    const sent: Array<string | undefined> = [];
    const result = await sendAskingForPassword(
      async (password) => {
        sent.push(password);
        throw apiError('PASSWORD_REQUIRED');
      },
      async () => answer
    );
    assert.equal(result, undefined);
    assert.deepEqual(sent, [undefined]);
  }
});

test('a wrong password is thrown for the page to report, and the person is asked only once', async () => {
  let asked = 0;
  await assert.rejects(
    sendAskingForPassword(
      async (password) => {
        throw apiError(password ? 'INVALID_PASSWORD' : 'PASSWORD_REQUIRED');
      },
      async () => (asked++, 'nope')
    ),
    (error: unknown) => (error as ReturnType<typeof apiError>).response.data.error.code === 'INVALID_PASSWORD'
  );
  assert.equal(asked, 1);
});

test('any other failure is thrown without asking for anything', async () => {
  let asked = 0;
  await assert.rejects(
    sendAskingForPassword(
      async () => {
        throw apiError('VALIDATION_ERROR');
      },
      async () => (asked++, 'secret')
    )
  );
  assert.equal(asked, 0);
});
