import { getGatewayStatuses, getConfiguredGateways } from '../src/gateways';

describe('getGatewayStatuses', () => {
  it('reports every registered gateway with a configuration status', () => {
    const statuses = getGatewayStatuses();
    expect(Object.keys(statuses).sort()).toEqual(['bank', 'easypaisa', 'jazzcash', 'safepay']);
    for (const status of Object.values(statuses)) {
      expect(['configured', 'not_configured']).toContain(status);
    }
  });

  it('agrees with getConfiguredGateways', () => {
    const statuses = getGatewayStatuses();
    const configured = Object.entries(statuses)
      .filter(([, s]) => s === 'configured')
      .map(([key]) => key)
      .sort();
    expect(getConfiguredGateways().sort()).toEqual(configured);
  });
});
