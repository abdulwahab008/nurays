/**
 * Payment gateway factory and registry.
 * Use getGateway(method) to get the adapter for jazzcash, easypaisa, bank.
 */

import type { IPaymentGateway } from './types';
import { jazzcashGateway } from './jazzcash.gateway';
import { easypaisaGateway } from './easypaisa.gateway';
import { bankGateway } from './bank.gateway';
import { safepayGateway } from './safepay.gateway';

const gateways: Record<string, IPaymentGateway> = {
  jazzcash: jazzcashGateway,
  easypaisa: easypaisaGateway,
  bank: bankGateway,
  safepay: safepayGateway,
};

export function getGateway(method: string): IPaymentGateway | null {
  return gateways[method] ?? null;
}

export function getConfiguredGateways(): string[] {
  return Object.entries(gateways)
    .filter(([, g]) => g.isConfigured())
    .map(([key]) => key);
}

export type { IPaymentGateway, CreatePaymentRequest, CreatePaymentResult, VerifyPaymentRequest, VerifyPaymentResult } from './types';
export { jazzcashGateway, easypaisaGateway, bankGateway, safepayGateway };
