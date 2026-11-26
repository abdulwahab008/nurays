import { inRiderArea } from '../src/utils/dispatch';

const lahoreJob = { pickupCommunityId: 'dha', dropoffCommunityId: 'askari', city: 'Lahore' };

describe('which riders a job goes to', () => {
  it('a rider in another city is never offered it', () => {
    expect(inRiderArea({ communityId: null, city: 'Karachi' }, lahoreJob)).toBe(false);
    expect(inRiderArea({ communityId: 'gulshan', city: 'Karachi' }, lahoreJob)).toBe(false);
  });

  it('a rider in the same city is, whatever the letter case', () => {
    expect(inRiderArea({ communityId: null, city: ' lahore ' }, lahoreJob)).toBe(true);
  });

  it("a rider serving the kitchen's or the customer's community is, even with another city on file", () => {
    expect(inRiderArea({ communityId: 'dha', city: 'Karachi' }, lahoreJob)).toBe(true);
    expect(inRiderArea({ communityId: 'askari', city: null }, lahoreJob)).toBe(true);
  });

  it('a job whose city is not known is not held back', () => {
    expect(inRiderArea({ communityId: null, city: 'Karachi' }, { pickupCommunityId: null, dropoffCommunityId: null, city: null })).toBe(true);
  });
});
