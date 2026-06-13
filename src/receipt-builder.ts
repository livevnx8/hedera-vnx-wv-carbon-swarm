/**
 * WvEnergy Verification Receipt Builder
 * Cryptographic receipts for WV energy swarm decisions + carbon retirements.
 * Task hash + decision hash + energy data hash + carbon outcome.
 */

import { createHash } from 'crypto';
import { WvVerificationReceipt, WorkerVote, PaymentResult, CarbonRetirement } from './types.js';
import { toHashScanTransactionUrl, toMirrorNodeTransactionUrl } from './proof-urls.js';

export class WvReceiptBuilder {
  build(
    taskDescription: string,
    energyDataHash: string,
    batchId: string,
    period: string,
    votes: WorkerVote[],
    selected: WorkerVote,
    payment: PaymentResult,
    carbon: CarbonRetirement,
    hcsInfo?: { topicId: string; sequenceNumber?: string; transactionId?: string },
  ): WvVerificationReceipt {
    const timestamp = Date.now();
    const taskHash = this._sha256(taskDescription);
    const decisionPayload = `${selected.workerId}:${selected.score}:${payment.transactionId ?? 'no-tx'}:${taskHash}:${energyDataHash}:${carbon.retiredTons}`;
    const decisionHash = this._sha256(decisionPayload);

    const proofStatus =
      payment.status === 'success' && payment.network === 'mainnet' && !!payment.transactionId
        ? 'mainnet_confirmed'
        : 'not_mainnet_proof';

    const hcsUrl = hcsInfo?.sequenceNumber
      ? `https://hashscan.io/mainnet/topic/${hcsInfo.topicId}/${hcsInfo.sequenceNumber}`
      : undefined;

    return {
      version: '1.0',
      network: payment.network,
      timestamp,
      taskHash,
      energyDataHash,
      batchId,
      period,
      votes: votes.map(v => ({
        workerId: v.workerId,
        name: v.name,
        specialty: v.specialty,
        confidence: v.confidence,
        priceHbar: v.priceHbar,
        paymentAccount: v.paymentAccount,
        score: v.score ?? 0,
      })),
      selected: {
        workerId: selected.workerId,
        name: selected.name,
        specialty: selected.specialty,
        priceHbar: selected.priceHbar,
        paymentAccount: selected.paymentAccount,
        score: selected.score ?? 0,
      },
      payment,
      carbon,
      decisionHash,
      hcsMessage: hcsInfo ? {
        topicId: hcsInfo.topicId,
        sequenceNumber: hcsInfo.sequenceNumber,
        transactionId: hcsInfo.transactionId,
      } : undefined,
      proofStatus,
      explorerUrl: proofStatus === 'mainnet_confirmed' && payment.transactionId
        ? toHashScanTransactionUrl(payment.transactionId)
        : undefined,
      mirrorNodeUrl: proofStatus === 'mainnet_confirmed' && payment.transactionId
        ? toMirrorNodeTransactionUrl(payment.transactionId)
        : undefined,
      hcsUrl,
    };
  }

  private _sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
