/**
 * HederaPaymentRail (same safety pattern as core VNX paid-swarm)
 */
import { PaymentRail, PaymentResult } from './types.js';
import { HederaClient } from './hedera-client.js';

export interface PaymentRailConfig {
  requireMainnet: boolean;
  maxHbar: number;
}

export class HederaPaymentRail implements PaymentRail {
  private _client: HederaClient | null = null;

  constructor(private _config: PaymentRailConfig) {
    const network = (process.env['HEDERA_NETWORK'] ?? 'mainnet') as string;
    if (_config.requireMainnet && network !== 'mainnet') {
      throw new Error(`Live run requires HEDERA_NETWORK=mainnet (got ${network}). Use --plan-only.`);
    }
  }

  private async _init() {
    if (this._client) return;
    const c = HederaClient.fromEnv();
    if (!c) throw new Error('Missing HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY');
    this._client = c;
  }

  async transfer(toAccountId: string, amountHbar: number, memo?: string): Promise<PaymentResult> {
    if (amountHbar <= 0) return this._fail('Amount must be positive', toAccountId, amountHbar);
    if (amountHbar > this._config.maxHbar) return this._fail(`Exceeds maxHbar cap ${this._config.maxHbar}`, toAccountId, amountHbar);
    try {
      await this._init();
      const r = await this._client!.transferHbar(toAccountId, amountHbar, memo);
      return {
        status: 'success',
        transactionId: r.transactionId,
        network: process.env['HEDERA_NETWORK'] ?? 'mainnet',
        amountHbar,
        recipient: toAccountId,
        consensusTimestampMs: r.consensusTimestampMs,
      };
    } catch (e: any) {
      return this._fail(e.message, toAccountId, amountHbar);
    }
  }

  private _fail(msg: string, recipient: string, amountHbar: number): PaymentResult {
    return { status: 'payment_failed', network: process.env['HEDERA_NETWORK'] ?? 'unknown', amountHbar, recipient, error: msg };
  }
}
