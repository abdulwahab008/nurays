import test from 'node:test';
import assert from 'node:assert/strict';
import { askProblem } from '../../lib/ask-validation.ts';

test('an empty answer is refused unless the window says it is optional', () => {
  assert.equal(askProblem({}, ''), 'required');
  assert.equal(askProblem({ optional: true }, ''), null);
});

test('a reason must reach its minimum length', () => {
  assert.equal(askProblem({ minLength: 5 }, 'no'), 'minLength');
  assert.equal(askProblem({ minLength: 5 }, 'wrong item'), null);
  assert.equal(askProblem({ minLength: 5 }, ''), 'required');
});

test('a new password must reach its minimum length (12 for staff)', () => {
  assert.equal(askProblem({ minLength: 12 }, 'short-pass-1'.slice(0, 11)), 'minLength');
  assert.equal(askProblem({ minLength: 12 }, 'Maple-Harbor-52'), null);
});

test('closing an account needs the exact word, whatever else is typed', () => {
  assert.equal(askProblem({ mustEqual: 'DELETE' }, 'delete'), 'mustEqual');
  assert.equal(askProblem({ mustEqual: 'DELETE' }, 'DELETE '), 'mustEqual');
  assert.equal(askProblem({ mustEqual: 'DELETE' }, ''), 'mustEqual');
  assert.equal(askProblem({ mustEqual: 'DELETE' }, 'DELETE'), null);
});

test('the exact-word rule wins over the others', () => {
  assert.equal(askProblem({ mustEqual: 'DELETE', minLength: 2, optional: true }, ''), 'mustEqual');
});

test('an optional answer that is typed still has to meet the minimum', () => {
  assert.equal(askProblem({ optional: true, minLength: 5 }, 'abc'), 'minLength');
});
