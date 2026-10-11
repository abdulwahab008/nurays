import test from 'node:test';
import assert from 'node:assert/strict';
import { asksForBorderColour, asksForTextColour } from '../../lib/class-colours.ts';

// The shared Button paints its variant's colours as inline styles, which beat every class; it steps aside only for a
// colour the caller names in className. A size class must not make it step aside.
test('text colours are recognised, size and layout classes are not', () => {
  for (const c of ['text-red-700', 'bg-green-600 text-white', 'text-slate-200 hover:bg-slate-800', 'a text-[#0c1016]', 'text-gray-500/80', 'text-black']) assert.equal(asksForTextColour(c), true, c);
  for (const c of ['text-xs', 'text-sm font-bold', 'text-[15px]', 'text-center', 'hover:text-white', 'md:text-red-500', 'context-menu', '', undefined]) assert.equal(asksForTextColour(c), false, String(c));
});

test('border colours are recognised, border widths and sides are not', () => {
  for (const c of ['border-red-200', 'border-slate-300 rounded', 'border-white', 'border-transparent', 'x border-[#fff]']) assert.equal(asksForBorderColour(c), true, c);
  for (const c of ['border', 'border-2', 'border-b', 'border-dashed', 'hover:border-red-200', 'rounded-border', '', undefined]) assert.equal(asksForBorderColour(c), false, String(c));
});
