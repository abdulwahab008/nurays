/**
 * A kitchen that signs up with "Cook & Sell" has only a name. It must be able to add its community, its place on the map and
 * its CNIC while it waits (it used to be refused: "Seller account already exists"), the administrator must not be able to
 * approve it until they are there, and a rejection must say why. The database is a hand-written double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: { syncRiderDuty: jest.fn() } }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn() }));
jest.mock('../src/services/notify.service', () => ({ notify: jest.fn(), notifySeller: jest.fn() }));
jest.mock('../src/services/approvals.service', () => ({ notifyApprovers: jest.fn() }));
jest.mock('../src/storage', () => ({ presentFile: jest.fn(async (u: string) => u) }));

import { kitchenApplicationGaps } from '../src/utils/kitchenApplication';
import sellerService from '../src/services/seller.service';
import adminService from '../src/services/admin.service';
import { notify } from '../src/services/notify.service';

const COMPLETE = { communityId: 'c1', latitude: 24.9, longitude: 67.1 };
const BOTH_SIDES = ['cnic_front', 'cnic_back', 'kitchen_photo'];

describe('kitchenApplicationGaps', () => {
  it('is empty for a complete application', () => {
    expect(kitchenApplicationGaps(COMPLETE, BOTH_SIDES)).toEqual([]);
  });

  it('names everything that is missing, in the words the administrator reads', () => {
    expect(kitchenApplicationGaps({ communityId: null, latitude: null, longitude: null }, [])).toEqual(['community', 'kitchen location', 'CNIC photos (both sides)']);
    expect(kitchenApplicationGaps({ ...COMPLETE, latitude: null }, BOTH_SIDES)).toEqual(['kitchen location']);
    expect(kitchenApplicationGaps(COMPLETE, ['cnic_front'])).toEqual(['CNIC photos (both sides)']);
    expect(kitchenApplicationGaps(COMPLETE, ['kitchen_photo', 'cnic_back'])).toEqual(['CNIC photos (both sides)']);
  });

  it('counts a coordinate of 0 as present, not missing', () => {
    expect(kitchenApplicationGaps({ communityId: 'c1', latitude: 0, longitude: 0 }, BOTH_SIDES)).toEqual([]);
  });
});

function givenSeller(over: Record<string, unknown>, documentTypes: string[]) {
  const seller = { id: 's1', userId: 'u1', businessName: 'Zainab', verificationStatus: 'pending', businessType: 'home_kitchen', mealCategories: [], deliveryModes: ['delivery'], coverImageUrl: null, latitude: null, longitude: null, communityId: null, ...over };
  db.seller = { findUnique: jest.fn(async () => seller), update: jest.fn(async ({ data }: any) => ({ ...seller, ...data })) };
  db.sellerDocument = { findMany: jest.fn(async () => documentTypes.map((documentType) => ({ documentType }))), count: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() };
  db.$transaction = jest.fn(async (ops: unknown[]) => ops);
  return seller;
}

describe('a kitchen that is still waiting', () => {
  const details = { businessName: 'Zainab', communityId: 'c1', primaryCommunityName: 'Askari 11', latitude: 24.9, longitude: 67.1 };

  it('can add what its application lacks (it is completed, not refused)', async () => {
    givenSeller({}, ['cnic_front', 'cnic_back']);
    const out = await sellerService.registerAsSeller('u1', details);
    expect(db.seller.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ communityId: 'c1', latitude: 24.9, longitude: 67.1, verificationStatus: 'pending' }) }));
    expect(out).toMatchObject({ sellerId: 's1', verificationStatus: 'pending', message: 'Application completed and sent for review' });
  });

  it('is asked for the CNIC when none is on file and none is sent', async () => {
    givenSeller({}, []);
    await expect(sellerService.registerAsSeller('u1', details)).rejects.toMatchObject({ code: 'CNIC_REQUIRED' });
    expect(db.seller.update).not.toHaveBeenCalled();
  });

  it('cannot send a complete application again: it is already under review', async () => {
    givenSeller(COMPLETE, BOTH_SIDES);
    await expect(sellerService.registerAsSeller('u1', details)).rejects.toMatchObject({ statusCode: 400, code: 'SELLER_ALREADY_EXISTS' });
    expect(db.seller.update).not.toHaveBeenCalled();
  });

  it('cannot register again once approved or suspended, even with nothing on file', async () => {
    for (const verificationStatus of ['approved', 'suspended']) {
      givenSeller({ verificationStatus }, []);
      await expect(sellerService.registerAsSeller('u1', details)).rejects.toMatchObject({ code: 'SELLER_ALREADY_EXISTS' });
    }
  });

  it('can still send a rejected application again', async () => {
    givenSeller({ verificationStatus: 'rejected', rejectionReason: 'Photos unclear' }, ['cnic_front', 'cnic_back']);
    const out = await sellerService.registerAsSeller('u1', details);
    expect(out.message).toBe('Application resubmitted for review');
    expect(db.seller.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rejectionReason: null }) }));
  });
});

describe('the administrator\'s decision on a kitchen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cannot approve a kitchen with no community, no place on the map and no CNIC, and is told what is missing', async () => {
    givenSeller({}, []);
    await expect(adminService.approveRejectSeller('s1', 'admin1', true)).rejects.toMatchObject({
      statusCode: 409,
      code: 'APPLICATION_INCOMPLETE',
      details: { missing: ['community', 'kitchen location', 'CNIC photos (both sides)'] },
    });
    expect(db.seller.update).not.toHaveBeenCalled();
  });

  it('approves a complete application', async () => {
    givenSeller(COMPLETE, BOTH_SIDES);
    db.user = { update: jest.fn() };
    const out = await adminService.approveRejectSeller('s1', 'admin1', true);
    expect(out).toMatchObject({ verificationStatus: 'approved', isVerified: true, status: 'active' });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { userType: 'seller' } });
  });

  it('will not reject without a reason (nothing, blank or a word is not a reason)', async () => {
    givenSeller({}, []);
    for (const notes of [undefined, '', '   ', 'no']) {
      await expect(adminService.approveRejectSeller('s1', 'admin1', false, notes)).rejects.toMatchObject({ statusCode: 400, code: 'REASON_REQUIRED' });
    }
    expect(db.seller.update).not.toHaveBeenCalled();
  });

  it('rejects with the reason, which the kitchen is shown and told', async () => {
    givenSeller({}, []);
    await adminService.approveRejectSeller('s1', 'admin1', false, '  The photos of the CNIC are too blurry to read  ');
    expect(db.seller.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ verificationStatus: 'rejected', rejectionReason: 'The photos of the CNIC are too blurry to read' }) }));
    expect((notify as jest.Mock).mock.calls[0][0].message).toBe('Reason: The photos of the CNIC are too blurry to read');
  });

  it('lists what each waiting application lacks, so the screen can say so', async () => {
    db.seller = {
      findMany: jest.fn(async () => [
        { id: 's1', businessName: 'A', communityId: null, latitude: null, longitude: null, documents: [], user: { id: 'u1', phone: '1', email: 'a@x', profile: null }, createdAt: new Date() },
        { id: 's2', businessName: 'B', ...COMPLETE, documents: [{ id: 'd1', documentType: 'cnic_front', documentUrl: 'x' }, { id: 'd2', documentType: 'cnic_back', documentUrl: 'y' }], user: { id: 'u2', phone: '2', email: 'b@x', profile: null }, createdAt: new Date() },
      ]),
    };
    const list = await adminService.getPendingSellers();
    expect(list.map((s) => s.missing)).toEqual([['community', 'kitchen location', 'CNIC photos (both sides)'], []]);
  });
});

describe('the administrator\'s decision on a rider', () => {
  it('will not reject without a reason', async () => {
    db.rider = { findUnique: jest.fn(async () => ({ id: 'r1', userId: 'u9', verificationStatus: 'pending' })), update: jest.fn(async () => ({ id: 'r1' })) };
    await expect(adminService.approveRejectRider('r1', false, '')).rejects.toMatchObject({ statusCode: 400, code: 'REASON_REQUIRED' });
    expect(db.rider.update).not.toHaveBeenCalled();
    await adminService.approveRejectRider('r1', false, 'The licence photo is not readable');
    expect(db.rider.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ verificationStatus: 'rejected', rejectionReason: 'The licence photo is not readable' }) }));
  });
});
