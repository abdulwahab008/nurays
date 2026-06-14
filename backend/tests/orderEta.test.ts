import { estimateDeliveryAt } from '../src/utils/orderEta';

const FROM = new Date('2026-01-01T12:00:00.000Z');
const minutesAfter = (d: Date) => Math.round((d.getTime() - FROM.getTime()) / 60000);

describe('estimateDeliveryAt', () => {
  it('uses default prep + fallback travel + buffer when nothing is known', () => {
    // 30 (default prep) + 30 (fallback travel, no coords) + 10 (buffer) = 70
    const eta = estimateDeliveryAt({ prepMinutes: [], origins: [], destination: {}, from: FROM });
    expect(minutesAfter(eta)).toBe(70);
  });

  it('honours a prep time longer than the default', () => {
    // 60 prep + 30 fallback + 10 buffer = 100
    const eta = estimateDeliveryAt({ prepMinutes: [60], origins: [], destination: {}, from: FROM });
    expect(minutesAfter(eta)).toBe(100);
  });

  it('floors prep at the default for short/invalid values', () => {
    const eta = estimateDeliveryAt({ prepMinutes: [10, null, 0], origins: [], destination: {}, from: FROM });
    expect(minutesAfter(eta)).toBe(70); // max(default 30, ...) = 30 -> 30+30+10
  });

  it('takes the slowest (longest) item prep time', () => {
    const eta = estimateDeliveryAt({ prepMinutes: [20, 45, 35], origins: [], destination: {}, from: FROM });
    expect(minutesAfter(eta)).toBe(85); // 45 + 30 + 10
  });

  it('returns an ETA strictly after the base time', () => {
    const eta = estimateDeliveryAt({ prepMinutes: [], origins: [], destination: {}, from: FROM });
    expect(eta.getTime()).toBeGreaterThan(FROM.getTime());
  });

  it('produces a later ETA for a farther destination (travel scales with distance)', () => {
    const origin = { latitude: 24.8607, longitude: 67.0011 };
    const near = estimateDeliveryAt({
      prepMinutes: [30],
      origins: [origin],
      destination: { latitude: 24.865, longitude: 67.005 },
      from: FROM,
    });
    const far = estimateDeliveryAt({
      prepMinutes: [30],
      origins: [origin],
      destination: { latitude: 24.95, longitude: 67.1 },
      from: FROM,
    });
    expect(far.getTime()).toBeGreaterThan(near.getTime());
  });
});
