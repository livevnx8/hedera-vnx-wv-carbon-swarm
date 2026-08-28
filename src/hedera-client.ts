/**
 * Minimal HederaClient wrapper (HBAR + basic balance).
 * For token retirement we add a helper in carbon-recorder.
 * Replicates the pattern from hedera-vnx-paid-swarm for consistency.
 * BIND HCS-SIGN-ORDER-012: same sign-order as paid-swarm/NVIDIA. No signed
 * CryptoTransfer until identity gate returned do-not-block. Order: resolve
 * identity OR rail-passed token → freezeWith → sign → execute. Raw
 * transferHbar without token/identity fails closed. Publisher seq is
 * observation-only and does not authorize sign.
 */

import {
  Client,
  AccountId,
  PrivateKey,
  AccountBalanceQuery,
  TransferTransaction,
  Hbar,
  HbarUnit,
  Status,
} from '@hashgraph/sdk';
import {
  CallerIdentity,
  resolveCallerIdentity,
  identityBlocksPayment,
  ResolvedCallerIdentity,
} from './identity-gate.js';

export interface HederaClientConfig {
  accountId: string;
  privateKey: string;
  network: 'mainnet' | 'testnet' | 'previewnet';
}

const RAIL_PASSED = new WeakSet<object>();

export interface RailPassedToken {
  readonly __railPassed: true;
  readonly identity_status: 'resolved';
}

export type TransferHbarAuth = CallerIdentity | RailPassedToken;

export function issueRailPassedToken(resolved: ResolvedCallerIdentity): RailPassedToken {
  if (resolved == null || resolved.identity_status !== 'resolved' || identityBlocksPayment(resolved)) {
    throw new Error(resolved?.reason || 'CONSENSUS_IDENTITY_UNRESOLVED');
  }
  const token: RailPassedToken = { __railPassed: true, identity_status: 'resolved' };
  RAIL_PASSED.add(token);
  return token;
}

export function isRailPassedToken(v: unknown): v is RailPassedToken {
  return typeof v === 'object' && v !== null && RAIL_PASSED.has(v);
}

export function authorizeSign(auth?: TransferHbarAuth | null): ResolvedCallerIdentity {
  if (isRailPassedToken(auth)) {
    return {
      identity_status: 'resolved',
      caller_canonical_present: true,
      manufactured: false,
      mirror_bytes_match: true,
      canonical: 'rail-passed',
      reason: null,
    };
  }
  if (auth == null) {
    throw new Error('CONSENSUS_IDENTITY_UNRESOLVED');
  }
  const resolved = resolveCallerIdentity(auth);
  if (identityBlocksPayment(resolved) || resolved.identity_status !== 'resolved') {
    throw new Error(resolved.reason || 'CONSENSUS_IDENTITY_UNRESOLVED');
  }
  return resolved;
}

export class HederaClient {
  private readonly _client: Client;
  private readonly _accountId: AccountId;
  private readonly _privateKey: PrivateKey;

  constructor(config: HederaClientConfig) {
    this._accountId = AccountId.fromString(config.accountId);
    this._privateKey = PrivateKey.fromStringECDSA(config.privateKey);
    switch (config.network) {
      case 'mainnet': this._client = Client.forMainnet(); break;
      case 'testnet': this._client = Client.forTestnet(); break;
      case 'previewnet': this._client = Client.forPreviewnet(); break;
    }
    this._client.setOperator(this._accountId, this._privateKey);
    this._client.setDefaultMaxTransactionFee(new Hbar(2));
  }

  async getBalance(accountId?: string) {
    const id = accountId ? AccountId.fromString(accountId) : this._accountId;
    const bal = await new AccountBalanceQuery().setAccountId(id).execute(this._client);
    const tokens: Record<string, number> = {};
    if (bal.tokens) for (const [tid, amt] of bal.tokens) tokens[tid.toString()] = amt.toNumber();
    return { hbar: bal.hbars.to(HbarUnit.Hbar).toNumber(), tokens, timestamp: Date.now() };
  }

  async transferHbar(toAccountId: string, amountHbar: number, memo?: string, auth?: TransferHbarAuth) {
    authorizeSign(auth);
    const tx = new TransferTransaction()
      .addHbarTransfer(this._accountId, new Hbar(-amountHbar))
      .addHbarTransfer(AccountId.fromString(toAccountId), new Hbar(amountHbar));
    if (memo) tx.setTransactionMemo(memo);
    const frozen = tx.freezeWith(this._client);
    const signed = await frozen.sign(this._privateKey);
    const resp = await signed.execute(this._client);
    const rec = await resp.getReceipt(this._client);
    return {
      transactionId: resp.transactionId.toString(),
      status: rec.status === Status.Success ? 'success' : rec.status.toString(),
      consensusTimestampMs: Date.now(),
    };
  }

  close() { this._client.close(); }

  static fromEnv(): HederaClient | null {
    const accountId = process.env['HEDERA_ACCOUNT_ID'];
    const privateKey = process.env['HEDERA_PRIVATE_KEY'];
    const network = (process.env['HEDERA_NETWORK'] ?? 'mainnet') as any;
    if (!accountId || !privateKey) return null;
    try { return new HederaClient({ accountId, privateKey, network }); } catch { return null; }
  }
}
