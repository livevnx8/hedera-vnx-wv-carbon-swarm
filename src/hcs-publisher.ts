/**
 * HCS Publisher for WV Carbon Verification events.
 * Publishes to the shared Vera Lattice HCS topic (0.0.10416185) for unified end-to-end audit trail.
 * Same topic used by the core VNX paid swarm.
 */

import {
  Client,
  TopicMessageSubmitTransaction,
  TopicId,
  AccountId,
  PrivateKey,
} from '@hashgraph/sdk';
import { HcsPublishResult } from './types.js';

export interface WvHcsMessage {
  type: 'vnx.wv.energy.verified.carbon.retired';
  batchId: string;
  period: string;
  energyDataHash: string;
  decisionHash: string;
  winnerWorker: string;
  verified: boolean;
  retiredTons: number;
  calcMethod: string;
  timestamp: number;
  version: string;
}

export interface WvHcsPublisherConfig {
  topicId: string;
  accountId: string;
  privateKey: string;
  network?: string;
}

export class WvHcsPublisher {
  private _client: Client;
  private _topicId: TopicId;
  private _accountId: AccountId;

  constructor(config: WvHcsPublisherConfig) {
    const network = config.network ?? 'mainnet';
    this._client = Client.forName(network as 'mainnet' | 'testnet' | 'previewnet');
    this._client.setOperator(
      AccountId.fromString(config.accountId),
      PrivateKey.fromStringECDSA(config.privateKey),
    );
    this._topicId = TopicId.fromString(config.topicId);
    this._accountId = AccountId.fromString(config.accountId);
  }

  async publish(message: WvHcsMessage): Promise<HcsPublishResult> {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(this._topicId)
        .setMessage(JSON.stringify(message));

      const response = await tx.execute(this._client);
      const receipt = await response.getReceipt(this._client);
      const record = await response.getRecord(this._client);

      return {
        status: 'success',
        sequenceNumber: receipt.topicSequenceNumber?.toString(),
        topicId: this._topicId.toString(),
        transactionId: response.transactionId.toString(),
        consensusTimestamp: record.consensusTimestamp?.toDate().toISOString(),
      };
    } catch (err) {
      return {
        status: 'failed',
        topicId: this._topicId.toString(),
        error: (err as Error).message,
      };
    }
  }

  static buildWvRetirementMessage(params: {
    batchId: string;
    period: string;
    energyDataHash: string;
    decisionHash: string;
    winnerWorker: string;
    verified: boolean;
    retiredTons: number;
    calcMethod: string;
  }): WvHcsMessage {
    return {
      type: 'vnx.wv.energy.verified.carbon.retired',
      ...params,
      timestamp: Date.now(),
      version: '1.0.0',
    };
  }

  close(): void {
    this._client.close();
  }
}

export class DryRunWvHcsPublisher {
  private _topicId: string;
  constructor(topicId: string) { this._topicId = topicId; }

  async publish(message: WvHcsMessage): Promise<HcsPublishResult> {
    console.log(`[DRY RUN HCS] Vera Lattice topic ${this._topicId}:`);
    console.log(JSON.stringify(message, null, 2));
    return {
      status: 'success',
      topicId: this._topicId,
      sequenceNumber: 'DRY_RUN_' + Date.now(),
      transactionId: `dry-run-hcs@${Date.now()}`,
    };
  }
  close(): void {}
}
