import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PRODUCT_FORM,
  discountPercent,
  formFromProduct,
  locateCategory,
  newVariant,
  productPayload,
  productProblem,
  profitOf,
  saveErrorMessage,
  variantPayload,
  withoutVariant,
  type VariantDraft,
} from '../../lib/product-form.ts';

const filled = { ...EMPTY_PRODUCT_FORM, name: ' Biryani ', price: '450', categoryId: 'cat-1', productType: 'ready_to_eat' as const };

test('a new dish needs a name, a category, a price above zero and the text of a custom unit', () => {
  assert.equal(productProblem({ ...filled, name: '  ' }, '', { requireCategory: true }), 'Please enter product name');
  assert.equal(productProblem({ ...filled, categoryId: '' }, '', { requireCategory: true }), 'Please select a category');
  assert.equal(productProblem({ ...filled, price: '0' }, '', { requireCategory: true }), 'Please enter a valid price');
  assert.equal(productProblem({ ...filled, price: 'abc' }, '', { requireCategory: true }), 'Please enter a valid price');
  assert.equal(productProblem({ ...filled, unit: 'other' }, ' ', { requireCategory: true }), 'Please enter a custom unit type');
  assert.equal(productProblem({ ...filled, unit: 'other' }, 'per tray', { requireCategory: true }), null);
});

test('an old dish saved without a category can still be edited', () => {
  assert.equal(productProblem({ ...filled, categoryId: '' }, '', { requireCategory: false }), null);
});

test('the body trims text, drops empty optionals, sends the custom unit, and sends visibility only on edit', () => {
  const form = { ...filled, unit: 'other', nameUrdu: ' ', originalPrice: '500', preparationTime: '30', isHalal: false, isActive: false };
  const created = productPayload(form, ' per tray ', ['a.jpg'], 'create');
  assert.equal(created.name, 'Biryani');
  assert.equal(created.nameUrdu, undefined);
  assert.equal(created.price, 450);
  assert.equal(created.originalPrice, 500);
  assert.equal(created.costPrice, undefined);
  assert.equal(created.preparationTime, 30);
  assert.equal(created.unit, 'per tray');
  assert.deepEqual(created.dietaryInfo, []);
  assert.deepEqual(created.images, ['a.jpg']);
  assert.equal('isActive' in created, false);
  assert.equal(productPayload(form, 'per tray', [], 'edit').isActive, false);
  assert.equal(productPayload({ ...filled, categoryId: '' }, '', [], 'edit').categoryId, undefined);
});

test('a saved dish fills the form, with a unit outside the list as "Other" and its text', () => {
  const { form, customUnit } = formFromProduct({
    name: 'Samosa',
    price: 300,
    originalPrice: null,
    category: { id: 'cat-9' },
    productType: 'frozen',
    unit: 'per tray',
    stockQuantity: 0,
    stockType: 'hub',
    dietaryInfo: [],
    isActive: false,
  });
  assert.equal(form.categoryId, 'cat-9');
  assert.equal(form.price, '300');
  assert.equal(form.originalPrice, '');
  assert.equal(form.unit, 'other');
  assert.equal(customUnit, 'per tray');
  assert.equal(form.stockType, 'hub');
  assert.equal(form.isHalal, false);
  assert.equal(form.isActive, false);

  const plain = formFromProduct({ name: 'Naan', price: '40', unit: 'piece', productType: 'something-else' });
  assert.equal(plain.form.unit, 'piece');
  assert.equal(plain.customUnit, '');
  assert.equal(plain.form.productType, '');
  assert.equal(plain.form.isHalal, true);
  assert.equal(plain.form.stockType, 'direct');
});

const v = (name: string, isDefault = false, id?: string): VariantDraft => ({ id, name, price: 100, stockQuantity: 5, isDefault, isActive: true });

test('removing the default variant makes the first one left the default', () => {
  const left = withoutVariant([v('S', true), v('M'), v('L')], 0);
  assert.deepEqual(left.map((x) => [x.name, x.isDefault]), [['M', true], ['L', false]]);
  assert.deepEqual(withoutVariant([v('S'), v('M', true)], 0).map((x) => x.isDefault), [true]);
  assert.deepEqual(withoutVariant([v('S', true)], 0), []);
});

test('a new variant starts at the dish price and only the first is the default', () => {
  assert.equal(newVariant({ ...filled, costPrice: '200' }, 0).price, 450);
  assert.equal(newVariant(filled, 0).isDefault, true);
  assert.equal(newVariant(filled, 2).isDefault, false);
  assert.equal(newVariant(filled, 0).costPrice, undefined);
});

test('a variant is sent in its position in the list, with the default alert at 10', () => {
  const body = variantPayload(v('L', false, 'x'), 3);
  assert.equal(body.sortOrder, 3);
  assert.equal(body.stockThreshold, 10);
  assert.equal(body.sku, null);
  assert.equal('id' in body, false);
});

test('a discount shows only when the original price is above the price', () => {
  assert.equal(discountPercent('300', '400'), 25);
  assert.equal(discountPercent('400', '300'), 0);
  assert.equal(discountPercent('300', ''), 0);
  assert.equal(discountPercent('', '400'), 0);
});

test('profit is the price less the cost and the 15% platform fee', () => {
  const p = profitOf(1000, 500);
  assert.equal(p.fee, 150);
  assert.equal(p.profit, 350);
  assert.equal(p.margin, 35);
  assert.equal(profitOf(0, 10).margin, 0);
});

test('a category is found at the top level or under its parent', () => {
  const tree = [{ id: 'a', name: 'Rice', children: [{ id: 'a1', name: 'Biryani' }] }, { id: 'b', name: 'Bread' }];
  assert.equal(locateCategory(tree, 'b')?.parent, null);
  assert.equal(locateCategory(tree, 'a1')?.parent?.id, 'a');
  assert.equal(locateCategory(tree, 'zzz'), null);
  assert.equal(locateCategory(tree, ''), null);
});

test('a refused save says which fields the server named, else its message, else the fallback', () => {
  const details = { response: { data: { error: { details: [{ field: 'price', message: 'too low' }] } } } };
  assert.equal(saveErrorMessage(details, 'x'), 'Validation error: price: too low');
  assert.equal(saveErrorMessage({ response: { data: { error: { message: 'Not yours' } } } }, 'x'), 'Not yours');
  assert.equal(saveErrorMessage({ response: { data: { message: 'Old shape' } } }, 'x'), 'Old shape');
  assert.equal(saveErrorMessage(new Error('boom'), 'Try again'), 'Try again');
});
