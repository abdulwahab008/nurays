jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));

import pino from 'pino';
import { logger, requestContext } from '../src/utils/logger';
import { logRefundIssued } from '../src/services/refund.service';

describe('domain event log lines', () => {
  it('logs an issued refund with ids and minor-unit amount only, tagged with the request id', () => {
    const lines: string[] = [];
    // pino writes to fd 1 directly unless jest has replaced process.stdout.write, so spy on the logger's own stream.
    const stream = (logger as unknown as Record<symbol, { write: (s: string) => void }>)[pino.symbols.streamSym];
    const write = jest.spyOn(stream, 'write').mockImplementation((chunk: string) => {
      lines.push(chunk);
      return true;
    });
    const level = logger.level;
    logger.level = 'info';
    try {
      requestContext.run({ requestId: 'rid-7' }, () => {
        logRefundIssued(null, { orderId: 'o-1', actor: 'customer' });
        logRefundIssued(
          { refundId: 'r-1', amount: 123.45, method: 'wallet', status: 'completed', fullyRefunded: true },
          { orderId: 'o-1', orderNumber: 'NR-1', actor: 'customer' }
        );
      });
    } finally {
      logger.level = level;
      write.mockRestore();
    }
    const events = lines.map((line) => JSON.parse(line)).filter((line) => line.event);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'refund.issued',
      requestId: 'rid-7',
      orderId: 'o-1',
      orderNumber: 'NR-1',
      refundId: 'r-1',
      actor: 'customer',
      amountMinor: 12345,
      fullyRefunded: true,
    });
  });
});
