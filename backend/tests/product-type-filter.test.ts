/**
 * The Dishes page's Frozen, Fresh cook, Ready to eat and Ready to cook chips sent productType and got every dish back: the
 * list endpoint validated the parameter and then left it out of the filters it passes on.
 */
jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/services/product.service', () => ({ __esModule: true, default: { getProducts: jest.fn(async () => ({ products: [] })) } }));

import type { Request, Response } from 'express';
import productService from '../src/services/product.service';
import { getProducts } from '../src/controllers/product.controller';

it('passes the dish type on to the search', async () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  await getProducts({ query: { productType: 'frozen' } } as unknown as Request, res);
  expect(productService.getProducts).toHaveBeenCalledWith(expect.objectContaining({ productType: 'frozen' }));
});
