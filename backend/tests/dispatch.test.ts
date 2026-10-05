/**
 * Which rider gets a new job: a rider already on the way gets nearby work, then the community's own
 * riders, then anyone with room; nobody over their limits.
 */
import { canShareTrip, chooseRider, DispatchCandidate, DispatchJob, JobEnds } from '../src/utils/dispatch';

const pt = (lat: number, lng: number) => ({ lat, lng });
const none = { lat: null, lng: null };

const job: DispatchJob = {
  pickup: pt(24.86, 67.0),
  dropoff: pt(24.9, 67.1),
  pickupCommunityId: 'askari',
  dropoffCommunityId: 'dha',
  cashToTake: 800,
};
const rider = (id: string, over: Partial<DispatchCandidate> = {}): DispatchCandidate => ({
  id,
  communityId: null,
  active: [],
  cashHeld: 0,
  cashToCollect: 0,
  cashLimit: 10_000,
  deliveriesToday: 0,
  ...over,
});
const carrying = (over: Partial<JobEnds> = {}): JobEnds => ({
  pickup: pt(24.861, 67.001),
  dropoff: pt(24.905, 67.105),
  pickupCommunityId: 'askari',
  dropoffCommunityId: 'dha',
  ...over,
});

describe('canShareTrip', () => {
  it('drop-offs in the same area and nearby pickups share a trip', () => {
    expect(canShareTrip(carrying(), job)).toBe(true);
  });
  it('far-apart drop-offs do not', () => {
    expect(canShareTrip(carrying({ dropoff: pt(25.2, 67.5) }), job)).toBe(false);
  });
  it('far-apart pickups do not, even with the same drop-off area', () => {
    expect(canShareTrip(carrying({ pickup: pt(25.5, 67.9) }), job)).toBe(false);
  });
  it('without coordinates, the same communities decide', () => {
    const blind: JobEnds = { pickup: none, dropoff: none, pickupCommunityId: 'askari', dropoffCommunityId: 'dha' };
    expect(canShareTrip(blind, { ...job, pickup: none, dropoff: none })).toBe(true);
    expect(canShareTrip({ ...blind, dropoffCommunityId: 'gulshan' }, { ...job, pickup: none, dropoff: none })).toBe(false);
  });
});

describe('chooseRider', () => {
  it('a rider already going that way gets it, even over the community rider', () => {
    const choice = chooseRider(job, [rider('community', { communityId: 'askari' }), rider('onTheWay', { active: [carrying()] })]);
    expect(choice).toEqual({ riderId: 'onTheWay', reason: 'shares_a_trip' });
  });

  it("otherwise the pickup community's rider, then the drop-off community's, then anyone", () => {
    expect(chooseRider(job, [rider('any'), rider('dropoff', { communityId: 'dha' }), rider('pickup', { communityId: 'askari' })])?.riderId).toBe('pickup');
    expect(chooseRider(job, [rider('any'), rider('dropoff', { communityId: 'dha' })])?.riderId).toBe('dropoff');
    expect(chooseRider(job, [rider('any')])).toEqual({ riderId: 'any', reason: 'available' });
  });

  it('a rider with two jobs is never chosen', () => {
    expect(chooseRider(job, [rider('busy', { communityId: 'askari', active: [carrying(), carrying()] })])).toBeNull();
  });

  it('a cash job that would pass the rider limit goes to someone else (prepaid ignores the limit)', () => {
    const full = rider('full', { communityId: 'askari', cashHeld: 9_500 });
    expect(chooseRider(job, [full, rider('other')])?.riderId).toBe('other');
    expect(chooseRider(job, [full])).toBeNull();
    expect(chooseRider({ ...job, cashToTake: 0 }, [full])?.riderId).toBe('full');
  });

  it('counts cash the rider will collect on jobs they already carry', () => {
    const r = rider('r', { cashHeld: 5_000, cashToCollect: 4_500 });
    expect(chooseRider(job, [r])).toBeNull();
  });

  it('shares work: fewer jobs first, then fewer deliveries today', () => {
    const a = rider('a', { communityId: 'askari', active: [carrying({ dropoff: pt(25.3, 67.6) })], deliveriesToday: 1 });
    const b = rider('b', { communityId: 'askari', deliveriesToday: 9 });
    const c = rider('c', { communityId: 'askari', deliveriesToday: 2 });
    expect(chooseRider(job, [a, b, c])?.riderId).toBe('c');
  });

  it('nobody available means no choice (the job stays in the pool)', () => {
    expect(chooseRider(job, [])).toBeNull();
  });
});
