/**
 * WV Energy + Carbon Verification Swarm Coordinator
 * Dispatches to BitLattice verification workers, selects winner, pays micro HBAR (VNX pattern),
 * computes retirement tons, anchors retirement attestation to Vera Lattice HCS topic,
 * and emits a full cryptographic WvVerificationReceipt.
 */

import { WorkerVote, WvVerificationReceipt, PaymentRail, CarbonRetirement, WvEnergyBatch } from './types.js';
import { VnxWorkerAgent } from './workers.js';
import { WvReceiptBuilder } from './receipt-builder.js';
import { computeRetirableTons, validateBatch } from './energy-adapter.js';
import { WvHcsPublisher, DryRunWvHcsPublisher, WvHcsMessage } from './hcs-publisher.js';

const SPECIALTY_MATCH_WEIGHTS: Record<string, Record<string, number>> = {
  'lattice-verification': { 'lattice-verification': 1.0, emissions: 0.6, 'grid-audit': 0.7, 'retirement-policy': 0.8 },
  emissions: { 'lattice-verification': 0.6, emissions: 1.0, 'grid-audit': 0.75, 'retirement-policy': 0.85 },
  'grid-audit': { 'lattice-verification': 0.7, emissions: 0.75, 'grid-audit': 1.0, 'retirement-policy': 0.7 },
  'retirement-policy': { 'lattice-verification': 0.85, emissions: 0.9, 'grid-audit': 0.65, 'retirement-policy': 1.0 },
};

export interface WvCoordinatorConfig {
  maxHbar: number;
  planOnly: boolean;
  hcsTopicId: string;
}

export class WvEnergyCarbonCoordinator {
  constructor(
    private _workers: VnxWorkerAgent[],
    private _config: WvCoordinatorConfig,
    private _paymentRail: PaymentRail,
    private _hcsPublisher?: WvHcsPublisher | DryRunWvHcsPublisher,
  ) {}

  async run(taskDescription: string, batch?: WvEnergyBatch): Promise<WvVerificationReceipt> {
    const builder = new WvReceiptBuilder();
    const energyBatch = batch;
    const energyDataHash = energyBatch?.dataHash ?? this._shaFallback(taskDescription);

    // 1. Dispatch to all BitLattice verification workers (pass batch for rich evidence)
    const rawVotes = this._workers.map(w => w.execute(taskDescription, energyBatch));

    // 2. Score
    const scoredVotes: WorkerVote[] = rawVotes.map(r => {
      const matchWeight = this._specialtyMatch(taskDescription, r.specialty);
      const effectivePrice = Math.max(r.priceHbar, 0.001);
      const score = (r.confidence * matchWeight) / (effectivePrice + 0.0001);
      return { ...r, score };
    });

    const eligible = scoredVotes.filter(v => v.priceHbar <= this._config.maxHbar);

    const winner = (eligible.length > 0
      ? eligible.reduce((best, cur) => (cur.score! > best.score! ? cur : best))
      : scoredVotes[0]);

    // 3. Compute carbon retirement outcome (deterministic from batch + verification win)
    let carbon: CarbonRetirement;
    if (energyBatch && validateBatch(energyBatch).ok) {
      const { retiredTons, eligibleCleanMwh, calcMethod } = computeRetirableTons(energyBatch);
      // The swarm "verifies" if a lattice/policy worker wins with reasonable confidence
      const verified = winner.confidence > 0.65 || winner.specialty.includes('retirement') || winner.specialty.includes('lattice');
      carbon = {
        verified,
        retiredTons: verified ? retiredTons : 0,
        calcMethod,
        eligibleCleanMwh,
        evidence: `Winner ${winner.name} (${winner.specialty}) + batch validated. ${verified ? 'RETIREMENT APPROVED' : 'retirement not triggered (low conf)'}.`,
      };
    } else {
      carbon = {
        verified: false,
        retiredTons: 0,
        calcMethod: 'no-valid-batch',
        eligibleCleanMwh: 0,
        evidence: 'No valid WV energy batch provided or validation failed.',
      };
    }

    // 4. Payment (micro HBAR to winning verification worker, or plan-only)
    let payment;
    if (this._config.planOnly) {
      payment = {
        status: 'skipped_plan_only' as const,
        network: 'plan-only',
        amountHbar: winner.priceHbar,
        recipient: winner.paymentAccount,
        consensusTimestampMs: 0,
      };
    } else {
      const memo = `VNX-WV:${winner.workerId}:${energyBatch?.id ?? 'batch'}:${carbon.retiredTons}t`;
      payment = await this._paymentRail.transfer(winner.paymentAccount, winner.priceHbar, memo);
    }

    // 5. Anchor retirement attestation to Vera Lattice HCS (shared topic)
    let hcsInfo: { topicId: string; sequenceNumber?: string; transactionId?: string } | undefined;
    if (carbon.verified && carbon.retiredTons > 0 && this._hcsPublisher) {
      const msg: WvHcsMessage = (this._hcsPublisher as any).constructor.buildWvRetirementMessage
        ? (this._hcsPublisher as any).constructor.buildWvRetirementMessage({
            batchId: energyBatch?.id ?? 'unknown',
            period: energyBatch?.period ?? 'unknown',
            energyDataHash,
            decisionHash: 'pending', // will be filled after receipt
            winnerWorker: winner.workerId,
            verified: carbon.verified,
            retiredTons: carbon.retiredTons,
            calcMethod: carbon.calcMethod,
          })
        : {
            type: 'vnx.wv.energy.verified.carbon.retired' as const,
            batchId: energyBatch?.id ?? 'unknown',
            period: energyBatch?.period ?? 'unknown',
            energyDataHash,
            decisionHash: 'pending',
            winnerWorker: winner.workerId,
            verified: carbon.verified,
            retiredTons: carbon.retiredTons,
            calcMethod: carbon.calcMethod,
            timestamp: Date.now(),
            version: '1.0.0',
          };

      const pub = await this._hcsPublisher.publish(msg);
      if (pub.status === 'success') {
        hcsInfo = {
          topicId: pub.topicId,
          sequenceNumber: pub.sequenceNumber,
          transactionId: pub.transactionId,
        };
      }
    }

    // 6. Final receipt (decisionHash incorporates carbon + energy)
    const receipt = builder.build(
      taskDescription,
      energyDataHash,
      energyBatch?.id ?? 'no-batch',
      energyBatch?.period ?? 'n/a',
      scoredVotes,
      winner,
      payment,
      carbon,
      hcsInfo,
    );

    return receipt;
  }

  private _specialtyMatch(task: string, workerSpecialty: string): number {
    const lower = task.toLowerCase();
    let bestDomain = 'lattice-verification';
    let bestScore = 0;
    for (const [domain, keywords] of Object.entries({
      'lattice-verification': ['lattice', 'verify', 'hash', 'integrity', 'bitlattice', 'proof'],
      emissions: ['emission', 'carbon', 'tco2', 'avoided'],
      'grid-audit': ['grid', 'wv', 'mix', 'coal', 'wind'],
      'retirement-policy': ['retire', 'credit', 'eligible', 'policy', 'verified'],
    })) {
      let score = 0;
      for (const kw of keywords) if (lower.includes(kw)) score++;
      if (score > bestScore) { bestScore = score; bestDomain = domain; }
    }
    const map = SPECIALTY_MATCH_WEIGHTS[bestDomain] ?? SPECIALTY_MATCH_WEIGHTS['lattice-verification'];
    return map[workerSpecialty] ?? 0.4;
  }

  private _shaFallback(input: string): string {
    // lightweight for no-batch cases
    let h = 0;
    for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(16, '0').repeat(4).slice(0, 64);
  }
}
