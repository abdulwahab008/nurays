/**
 * A rider used to be able to see/claim deliveries the instant they registered,
 * with zero admin vetting. requireRider (called by every rider-facing method)
 * must now refuse until an admin has explicitly approved the account.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    rider: { findUnique: jest.fn() },
    delivery: { findMany: jest.fn() },
  },
}));

import riderService from '../src/services/rider.service';
import prisma from '../src/config/database';

const findUniqueRider = (prisma as any).rider.findUnique as jest.Mock;
const findManyDelivery = (prisma as any).delivery.findMany as jest.Mock;

function makeRider(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rider-1',
    userId: 'user-1',
    status: 'active',
    verificationStatus: 'pending',
    ...overrides,
  };
}

beforeEach(() => {
  findUniqueRider.mockReset();
  findManyDelivery.mockReset();
  findManyDelivery.mockResolvedValue([]);
});

describe('requireRider gating (via getAvailableDeliveries)', () => {
  it('rejects a newly self-registered rider still pending approval', async () => {
    findUniqueRider.mockResolvedValue(makeRider({ verificationStatus: 'pending' }));
    await expect(riderService.getAvailableDeliveries('user-1')).rejects.toMatchObject({
      code: 'RIDER_NOT_APPROVED',
      statusCode: 403,
    });
    expect(findManyDelivery).not.toHaveBeenCalled();
  });

  it('rejects a rejected rider application', async () => {
    findUniqueRider.mockResolvedValue(makeRider({ verificationStatus: 'rejected' }));
    await expect(riderService.getAvailableDeliveries('user-1')).rejects.toMatchObject({
      code: 'RIDER_REJECTED',
      statusCode: 403,
    });
  });

  it('rejects a suspended rider even if previously approved', async () => {
    findUniqueRider.mockResolvedValue(makeRider({ verificationStatus: 'approved', status: 'suspended' }));
    await expect(riderService.getAvailableDeliveries('user-1')).rejects.toMatchObject({
      code: 'RIDER_SUSPENDED',
      statusCode: 403,
    });
  });

  it('allows an approved, active rider through', async () => {
    findUniqueRider.mockResolvedValue(makeRider({ verificationStatus: 'approved', status: 'active' }));
    await expect(riderService.getAvailableDeliveries('user-1')).resolves.toEqual([]);
    expect(findManyDelivery).toHaveBeenCalledTimes(1);
  });

  it('rejects when no rider profile exists at all', async () => {
    findUniqueRider.mockResolvedValue(null);
    await expect(riderService.getAvailableDeliveries('user-1')).rejects.toMatchObject({
      code: 'RIDER_NOT_FOUND',
      statusCode: 404,
    });
  });
});
