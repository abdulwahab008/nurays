/**
 * An approved rider can change their vehicle type and number plate without going back to review; the licence number
 * stays as the admins checked it. Every real change is written to the audit trail.
 */
jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: { rider: { findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn() }));

import prisma from '../src/config/database';
import riderService from '../src/services/rider.service';
import { recordAudit } from '../src/middleware/audit';
import { riderVehicleSchema } from '../src/validators/rider.validator';

const findRider = jest.mocked(prisma.rider.findUnique);
const updateRider = jest.mocked(prisma.rider.update);
const audit = jest.mocked(recordAudit);

function givenRider(over: Record<string, unknown> = {}) {
  findRider.mockResolvedValue({ id: 'r1', userId: 'u1', vehicleType: 'motorcycle', vehicleNumber: 'LEA-1234', licenseNumber: 'L-99', verificationStatus: 'approved', status: 'active', ...over } as never);
}

beforeEach(() => {
  findRider.mockReset();
  updateRider.mockReset();
  audit.mockReset();
});

describe('riderVehicleSchema', () => {
  it('accepts a known vehicle type and a plate', () => {
    expect(riderVehicleSchema.parse({ vehicleType: 'car', vehicleNumber: ' abc-12 ' })).toEqual({ vehicleType: 'car', vehicleNumber: 'abc-12' });
  });

  it('refuses an unknown vehicle type, an empty or overlong plate', () => {
    expect(riderVehicleSchema.safeParse({ vehicleType: 'truck', vehicleNumber: 'ABC-12' }).success).toBe(false);
    expect(riderVehicleSchema.safeParse({ vehicleType: 'car', vehicleNumber: ' ' }).success).toBe(false);
    expect(riderVehicleSchema.safeParse({ vehicleType: 'car', vehicleNumber: 'X'.repeat(21) }).success).toBe(false);
  });

  it('refuses a licence number or verification status sent with it', () => {
    expect(riderVehicleSchema.safeParse({ vehicleType: 'car', vehicleNumber: 'ABC-12', licenseNumber: 'L-1' }).success).toBe(false);
    expect(riderVehicleSchema.safeParse({ vehicleType: 'car', vehicleNumber: 'ABC-12', verificationStatus: 'approved' }).success).toBe(false);
  });
});

describe('riderService.updateVehicle', () => {
  it('saves an approved rider\'s new vehicle, upper-cases the plate, and audits the change', async () => {
    givenRider();
    await expect(riderService.updateVehicle('u1', { vehicleType: 'car', vehicleNumber: 'lhr-777' })).resolves.toEqual({ vehicleType: 'car', vehicleNumber: 'LHR-777' });
    expect(updateRider).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { vehicleType: 'car', vehicleNumber: 'LHR-777' } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      action: 'rider:VEHICLE_UPDATED',
      entityType: 'rider',
      entityId: 'r1',
      data: { from: { vehicleType: 'motorcycle', vehicleNumber: 'LEA-1234' }, to: { vehicleType: 'car', vehicleNumber: 'LHR-777' } },
    }));
  });

  it('keeps the rider approved and never touches the licence number', async () => {
    givenRider();
    await riderService.updateVehicle('u1', { vehicleType: 'scooter', vehicleNumber: 'LEA-1234' });
    const written = updateRider.mock.calls[0][0].data;
    expect(Object.keys(written).sort()).toEqual(['vehicleNumber', 'vehicleType']);
  });

  it('writes nothing and audits nothing when the details are unchanged', async () => {
    givenRider();
    await riderService.updateVehicle('u1', { vehicleType: 'motorcycle', vehicleNumber: 'lea-1234' });
    expect(updateRider).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it.each([
    [{ verificationStatus: 'pending' }, 'RIDER_NOT_APPROVED'],
    [{ verificationStatus: 'rejected' }, 'RIDER_REJECTED'],
    [{ status: 'suspended' }, 'RIDER_SUSPENDED'],
  ])('refuses a rider who is not approved and active (%o)', async (over, code) => {
    givenRider(over);
    await expect(riderService.updateVehicle('u1', { vehicleType: 'car', vehicleNumber: 'ABC-12' })).rejects.toMatchObject({ statusCode: 403, code });
    expect(updateRider).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('refuses when there is no rider profile', async () => {
    findRider.mockResolvedValue(null);
    await expect(riderService.updateVehicle('u1', { vehicleType: 'car', vehicleNumber: 'ABC-12' })).rejects.toMatchObject({ statusCode: 404, code: 'RIDER_NOT_FOUND' });
  });
});
