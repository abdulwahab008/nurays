import {
  canTransitionItem,
  allowedItemNextSteps,
  deriveOrderStatus,
  isValidItemStatus,
} from '../src/utils/orderStatus';

describe('orderStatus FSM', () => {
  describe('isValidItemStatus', () => {
    it('accepts known statuses and rejects unknown', () => {
      expect(isValidItemStatus('preparing')).toBe(true);
      expect(isValidItemStatus('delivered')).toBe(true);
      expect(isValidItemStatus('banana')).toBe(false);
      expect(isValidItemStatus('')).toBe(false);
    });
  });

  describe('canTransitionItem', () => {
    it('allows each legal forward step in the chain', () => {
      expect(canTransitionItem('pending', 'confirmed')).toBe(true);
      expect(canTransitionItem('confirmed', 'preparing')).toBe(true);
      expect(canTransitionItem('preparing', 'ready')).toBe(true);
      expect(canTransitionItem('ready', 'dispatched')).toBe(true);
      expect(canTransitionItem('dispatched', 'delivered')).toBe(true);
    });

    it('rejects skipping a step (ready -> delivered)', () => {
      expect(canTransitionItem('ready', 'delivered')).toBe(false);
      expect(canTransitionItem('pending', 'delivered')).toBe(false);
      expect(canTransitionItem('confirmed', 'ready')).toBe(false);
    });

    it('rejects moving backward', () => {
      expect(canTransitionItem('preparing', 'pending')).toBe(false);
      expect(canTransitionItem('ready', 'preparing')).toBe(false);
    });

    it('treats delivered/cancelled/rejected as terminal', () => {
      expect(canTransitionItem('delivered', 'dispatched')).toBe(false);
      expect(canTransitionItem('cancelled', 'pending')).toBe(false);
      expect(canTransitionItem('rejected', 'confirmed')).toBe(false);
    });

    it('rejects unknown statuses on either side', () => {
      expect(canTransitionItem('banana', 'confirmed')).toBe(false);
      expect(canTransitionItem('pending', 'banana')).toBe(false);
    });

    it('allows cancellation from active states and rejection from pending', () => {
      expect(canTransitionItem('pending', 'cancelled')).toBe(true);
      expect(canTransitionItem('preparing', 'cancelled')).toBe(true);
      expect(canTransitionItem('pending', 'rejected')).toBe(true);
      expect(canTransitionItem('preparing', 'rejected')).toBe(false);
    });
  });

  describe('allowedItemNextSteps', () => {
    it('lists next steps for an active status', () => {
      expect(allowedItemNextSteps('pending')).toEqual(['confirmed', 'rejected', 'cancelled']);
    });
    it('returns empty for terminal and unknown', () => {
      expect(allowedItemNextSteps('delivered')).toEqual([]);
      expect(allowedItemNextSteps('banana')).toEqual([]);
    });
  });

  describe('deriveOrderStatus', () => {
    it('returns the single status when all items agree', () => {
      expect(deriveOrderStatus(['preparing', 'preparing'])).toBe('preparing');
    });
    it('sits at the least-advanced active item', () => {
      expect(deriveOrderStatus(['ready', 'preparing', 'confirmed'])).toBe('confirmed');
      expect(deriveOrderStatus(['dispatched', 'delivered'])).toBe('dispatched');
    });
    it('ignores cancelled/rejected items when active ones remain', () => {
      expect(deriveOrderStatus(['cancelled', 'preparing'])).toBe('preparing');
      expect(deriveOrderStatus(['rejected', 'ready', 'dispatched'])).toBe('ready');
    });
    it('is delivered only when all active items are delivered', () => {
      expect(deriveOrderStatus(['delivered', 'delivered'])).toBe('delivered');
      expect(deriveOrderStatus(['delivered', 'cancelled'])).toBe('delivered');
    });
    it('is cancelled when every item is cancelled/rejected', () => {
      expect(deriveOrderStatus(['cancelled', 'rejected'])).toBe('cancelled');
    });
    it('returns null for an empty order', () => {
      expect(deriveOrderStatus([])).toBeNull();
    });
  });
});
