/**
 * WvEnergy Verification Receipt Builder
 * Cryptographic receipts for WV energy swarm decisions + carbon retirements.
 * Task hash + decision hash + energy data hash + carbon outcome.
 * BIND HCS-PAYMENT-RAIL-BIND-011: persist identity_status; never success-receipt on deny.
 * Publisher HCS seq is observation metadata, never caller identity.
 */

import { createHash } from 'crypto';
import { WvVerificationReceipt, WorkerVote, PaymentResult, CarbonRetirement, HcsObservation } from './types.js';
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
    hcsInfo?: HcsObservation,
  ): WvVerificationReceipt {
    const timestamp = Date.now();
    const taskHash = this._sha256(taskDescription);
    const decisionPayload = `${selected.workerId}:${selected.score}:${payment.transactionId ?? 'no-tx'}:${taskHash}:${energyDataHash}:${carbon.retiredTons}`;
    const decisionHash = this._sha256(decisionPayload);
    const identityStatus = payment.identity_status;
    const blocked = identityStatus === 'unresolved' || identityStatus === 'disagreement' || !identityStatus;
    const proofStatus =
      !blocked &&
      payment.status === 'success' &&
      payment.network === 'mainnet' &&
      !!payment.transactionId
        ? 'mainnet_confirmed'
        : 'not_mainnet_proof';
    const sha256Success = proofStatus === 'mainnet_confirmed' && payment.status === 'success' && !blocked;

    const publisherSeq = hcsInfo?.publisher_sequence_number;
    const hcsUrl = publisherSeq
      ? `https://hashscan.io/mainnet/topic/${hcsInfo!.topicId}/${publisherSeq}`
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
        publisher_sequence_number: hcsInfo.publisher_sequence_number,
        observation_kind: 'publisher_hcs_observation',
        not_caller_identity: true,
        transactionId: hcsInfo.transactionId,
      } : undefined,
      proofStatus,
      explorerUrl: sha256Success && payment.transactionId
        ? toHashScanTransactionUrl(payment.transactionId)
        : undefined,
      mirrorNodeUrl: sha256Success && payment.transactionId
        ? toMirrorNodeTransactionUrl(payment.transactionId)
        : undefined,
      hcsUrl,
      identity_status: identityStatus,
      caller_canonical_present: payment.caller_canonical_present,
      manufactured: payment.manufactured,
      mirror_bytes_match: payment.mirror_bytes_match,
    };
  }

  private _sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
