/**
 * HederaPaymentRail (same safety pattern as core VNX paid-swarm)
 * BIND HCS-PAYMENT-RAIL-BIND-011: identity_status gate before transferHbar.
 */
import { PaymentRail, PaymentResult, CallerIdentity } from './types.js';
import { HederaClient } from './hedera-client.js';
import {
  resolveCallerIdentity,
  identityBlocksPayment,
  ResolvedCallerIdentity,
} from './identity-gate.js';

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

  /**
   * Transfer HBAR to a recipient with validation and error normalization.
   * UNRESOLVED / DISAGREEMENT: do not call transferHbar / client execute.
   */
  async transfer(
    toAccountId: string,
    amountHbar: number,
    memo?: string,
    identity?: CallerIdentity,
  ): Promise<PaymentResult> {
    const resolved = resolveCallerIdentity(identity);
    if (identityBlocksPayment(resolved)) {
      const error =
        resolved.identity_status === 'disagreement'
          ? 'CONSENSUS_LOCATION_DISAGREEMENT'
          : 'CONSENSUS_IDENTITY_UNRESOLVED';
      return this._fail(error, toAccountId, amountHbar, resolved);
    }
    if (amountHbar <= 0) return this._fail('Amount must be positive', toAccountId, amountHbar, resolved);
    if (amountHbar > this._config.maxHbar) {
      return this._fail(`Exceeds maxHbar cap ${this._config.maxHbar}`, toAccountId, amountHbar, resolved);
    }
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
        identity_status: resolved.identity_status,
        caller_canonical_present: resolved.caller_canonical_present,
        manufactured: resolved.manufactured,
        mirror_bytes_match: resolved.mirror_bytes_match,
      };
    } catch (e: any) {
      return this._fail(e.message, toAccountId, amountHbar, resolved);
    }
  }

  private _fail(
    msg: string,
    recipient: string,
    amountHbar: number,
    resolved?: ResolvedCallerIdentity,
  ): PaymentResult {
    return {
      status: 'payment_failed',
      network: process.env['HEDERA_NETWORK'] ?? 'unknown',
      amountHbar,
      recipient,
      error: msg,
      identity_status: resolved?.identity_status,
      caller_canonical_present: resolved?.caller_canonical_present,
      manufactured: resolved?.manufactured,
      mirror_bytes_match: resolved?.mirror_bytes_match,
    };
  }
}
