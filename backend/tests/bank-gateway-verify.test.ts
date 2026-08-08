/**
 * The bank gateway used to unconditionally return status:'completed' from
 * verifyPayment with zero real verification. These tests lock in the fix:
 * verifyPayment must make a real call and fail closed on anything but an
 * explicit paid-like response.
 */

const ENV = {
  BANK_API_URL: 'https://bank.example.test',
  BANK_MERCHANT_ID: 'merchant-1',
  BANK_API_KEY: 'secret-key',
  BANK_RETURN_URL: 'https://app.example.test/return',
};

function loadConfiguredGateway() {
  jest.resetModules();
  Object.assign(process.env, ENV);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../src/gateways/bank.gateway').bankGateway;
}

function loadUnconfiguredGateway() {
  jest.resetModules();
  delete process.env.BANK_API_URL;
  delete process.env.BANK_MERCHANT_ID;
  delete process.env.BANK_API_KEY;
  delete process.env.BANK_RETURN_URL;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../src/gateways/bank.gateway').bankGateway;
}

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('bankGateway.verifyPayment', () => {
  it('refuses to verify when the gateway is not configured', async () => {
    const gateway = loadUnconfiguredGateway();
    const result = await gateway.verifyPayment({ paymentId: 'ref-1' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('GATEWAY_NOT_CONFIGURED');
  });

  it('only reports completed when the bank API explicitly says paid', async () => {
    const gateway = loadConfiguredGateway();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'paid', amount: 500, transaction_id: 'txn-1' }),
    }) as any;

    const result = await gateway.verifyPayment({ paymentId: 'ref-1' });
    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.transactionId).toBe('txn-1');
    expect(result.amountPkr).toBe(500);
  });

  it('treats an in-progress/unrecognized status as pending, never completed', async () => {
    const gateway = loadConfiguredGateway();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'processing' }),
    }) as any;

    const result = await gateway.verifyPayment({ paymentId: 'ref-1' });
    expect(result.status).toBe('pending');
    expect(result.success).toBe(false);
  });

  it('reports a declined payment as failed', async () => {
    const gateway = loadConfiguredGateway();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'declined' }),
    }) as any;

    const result = await gateway.verifyPayment({ paymentId: 'ref-1' });
    expect(result.status).toBe('failed');
    expect(result.success).toBe(false);
  });

  it('reports a cancelled payment as cancelled', async () => {
    const gateway = loadConfiguredGateway();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'cancelled' }),
    }) as any;

    const result = await gateway.verifyPayment({ paymentId: 'ref-1' });
    expect(result.status).toBe('cancelled');
    expect(result.success).toBe(false);
  });

  it('fails closed on a non-OK HTTP response instead of assuming paid', async () => {
    const gateway = loadConfiguredGateway();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'internal error' }),
    }) as any;

    const result = await gateway.verifyPayment({ paymentId: 'ref-1' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('BANK_VERIFY_FAILED');
  });

  it('fails closed when the bank API is unreachable', async () => {
    const gateway = loadConfiguredGateway();
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    const result = await gateway.verifyPayment({ paymentId: 'ref-1' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('BANK_VERIFY_FAILED');
  });

  it('makes an authenticated request to the configured bank API, not a fabricated success', async () => {
    const gateway = loadConfiguredGateway();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'paid' }),
    });
    global.fetch = fetchMock as any;

    await gateway.verifyPayment({ paymentId: 'ref-42' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('ref-42');
    expect(init.headers.Authorization).toBe(`Bearer ${ENV.BANK_API_KEY}`);
  });
});

describe('bankGateway.createPayment', () => {
  const baseRequest = {
    orderId: 'order-1',
    orderNumber: 'FN20260101',
    amountPkr: 1000,
    returnUrl: 'https://app.example.test/return',
    cancelUrl: 'https://app.example.test/cancel',
  };

  it('refuses to initiate when the gateway is not configured', async () => {
    const gateway = loadUnconfiguredGateway();
    const result = await gateway.createPayment(baseRequest);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('GATEWAY_NOT_CONFIGURED');
  });

  it('uses the bank-issued reference, not a locally-fabricated one', async () => {
    const gateway = loadConfiguredGateway();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reference: 'BANK-REAL-REF-123', redirect_url: 'https://bank.example.test/pay/123' }),
    }) as any;

    const result = await gateway.createPayment(baseRequest);
    expect(result.success).toBe(true);
    expect(result.paymentId).toBe('BANK-REAL-REF-123');
    expect(result.redirectUrl).toBe('https://bank.example.test/pay/123');
  });

  it('fails when the bank API does not return a reference', async () => {
    const gateway = loadConfiguredGateway();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as any;

    const result = await gateway.createPayment(baseRequest);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('BANK_INIT_FAILED');
  });

  it('fails when the bank API is unreachable', async () => {
    const gateway = loadConfiguredGateway();
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    const result = await gateway.createPayment(baseRequest);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('BANK_INIT_FAILED');
  });
});
