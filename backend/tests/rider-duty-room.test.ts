/**
 * Jobs in the open pool are announced to the riders who can take them (approved, active, on duty), through one
 * room. These tests check who is in it: a rider who connects on duty, one who switches on or off, a connection
 * that opens just as the rider switches off, and a database that fails.
 */

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: { rider: { findUnique: jest.fn() } },
}));
jest.mock('../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import prisma from '../src/config/database';
import { logger } from '../src/utils/logger';
import socketManager, { ON_DUTY_RIDERS_ROOM } from '../src/config/socket';
import { canTakePoolJobs, ON_DUTY_RIDER } from '../src/utils/riderDuty';

const db = prisma as any;
const manager = socketManager as any;

const standing = (over: Record<string, unknown> = {}) => ({ verificationStatus: 'approved', status: 'active', isAvailable: true, ...over });

describe('canTakePoolJobs', () => {
  it('is true only for a rider who is approved, active and on duty', () => {
    expect(canTakePoolJobs(standing())).toBe(true);
    expect(canTakePoolJobs(standing({ isAvailable: false }))).toBe(false);
    expect(canTakePoolJobs(standing({ status: 'suspended' }))).toBe(false);
    expect(canTakePoolJobs(standing({ verificationStatus: 'pending' }))).toBe(false);
    expect(canTakePoolJobs(standing({ verificationStatus: 'rejected' }))).toBe(false);
    expect(canTakePoolJobs(null)).toBe(false);
    expect(canTakePoolJobs(undefined)).toBe(false);
  });

  it('is the dispatcher\'s own candidate filter', () => {
    expect(ON_DUTY_RIDER).toEqual({ verificationStatus: 'approved', status: 'active', isAvailable: true });
  });
});

describe('the on-duty room', () => {
  const socketsJoin = jest.fn();
  const socketsLeave = jest.fn();
  const emit = jest.fn();
  let rooms: string[];
  let sentTo: string[];

  beforeEach(() => {
    rooms = [];
    sentTo = [];
    manager.io = {
      in: jest.fn((room: string) => {
        rooms.push(room);
        return { socketsJoin, socketsLeave };
      }),
      to: jest.fn((room: string) => {
        sentTo.push(room);
        return { emit };
      }),
    };
  });
  afterEach(() => {
    manager.io = null;
  });

  it('puts every connection of a rider who is on duty into the room', async () => {
    db.rider.findUnique.mockResolvedValue(standing());
    await socketManager.syncRiderDuty('u1');
    expect(rooms).toEqual(['user:u1']);
    expect(socketsJoin).toHaveBeenCalledWith(ON_DUTY_RIDERS_ROOM);
    expect(socketsLeave).not.toHaveBeenCalled();
  });

  it('takes them out when the rider goes off duty, is suspended or is not approved', async () => {
    for (const over of [{ isAvailable: false }, { status: 'suspended' }, { verificationStatus: 'rejected' }]) {
      socketsLeave.mockClear();
      db.rider.findUnique.mockResolvedValue(standing(over));
      await socketManager.syncRiderDuty('u1');
      expect(socketsLeave).toHaveBeenCalledWith(ON_DUTY_RIDERS_ROOM);
    }
    expect(socketsJoin).not.toHaveBeenCalled();
  });

  it('leaves the room as it is, and does not throw, when the database fails', async () => {
    db.rider.findUnique.mockRejectedValue(new Error('database is down'));
    await expect(socketManager.syncRiderDuty('u1')).resolves.toBeUndefined();
    expect(socketsJoin).not.toHaveBeenCalled();
    expect(socketsLeave).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('sends pool events to that room and to no other', () => {
    socketManager.emitToOnDutyRiders('delivery:new', { deliveryId: 'd1' });
    expect(sentTo).toEqual([ON_DUTY_RIDERS_ROOM]);
    expect(emit).toHaveBeenCalledWith('delivery:new', { deliveryId: 'd1' });
  });

  describe('a rider\'s new connection', () => {
    const connection = () => ({ join: jest.fn(), leave: jest.fn() });

    it('joins when the rider is on duty', async () => {
      db.rider.findUnique.mockResolvedValue(standing());
      const socket = connection();
      await manager.joinOnDutyRoomIfEligible(socket, 'u1');
      expect(socket.join).toHaveBeenCalledWith(ON_DUTY_RIDERS_ROOM);
      expect(socket.leave).not.toHaveBeenCalled();
    });

    it('does not join when the rider is off duty or not approved', async () => {
      for (const over of [{ isAvailable: false }, { verificationStatus: 'pending' }, { status: 'suspended' }]) {
        db.rider.findUnique.mockResolvedValue(standing(over));
        const socket = connection();
        await manager.joinOnDutyRoomIfEligible(socket, 'u1');
        expect(socket.join).not.toHaveBeenCalled();
      }
    });

    it('leaves again when the rider switched off between the first look and the join', async () => {
      db.rider.findUnique.mockResolvedValueOnce(standing()).mockResolvedValueOnce(standing({ isAvailable: false }));
      const socket = connection();
      await manager.joinOnDutyRoomIfEligible(socket, 'u1');
      expect(socket.join).toHaveBeenCalledWith(ON_DUTY_RIDERS_ROOM);
      expect(socket.leave).toHaveBeenCalledWith(ON_DUTY_RIDERS_ROOM);
    });

    it('does not throw when the database fails', async () => {
        db.rider.findUnique.mockRejectedValue(new Error('database is down'));
      const socket = connection();
      await expect(manager.joinOnDutyRoomIfEligible(socket, 'u1')).resolves.toBeUndefined();
      expect(socket.join).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
