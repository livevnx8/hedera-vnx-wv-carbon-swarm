/**
 * VNX BitLattice WV Energy Carbon Verification Swarm — Shared Types
 * Extends VNX swarm patterns for West Virginia energy data verification
 * and cryptographically anchored carbon credit retirement.
 */

export interface WvEnergyBatch {
  id: string;
  period: string; // e.g. '2026-05'
  state: 'WV';
  netGenerationMwh: number;
  bySource: {
    coal: number;
    natural_gas: number;
    wind: number;
    solar: number;
    other: number;
  };
  totalConsumptionMwh?: number;
  provenance: 'EIA' | 'PJM' | 'ISO' | 'manual' | 'verified';
  dataHash: string; // SHA-256 of canonical batch
  sourceRef?: string; // e.g. EIA series or URL
}

export interface SwarmTask {
  id: string;
  description: string;
  timestamp: number;
  energyBatch?: WvEnergyBatch;
}

export interface WorkerVote {
  workerId: string;
  name: string;
  specialty: string;
  recommendation: string;
  confidence: number;
  priceHbar: number;
  paymentAccount: string;
  evidence: string;
  score?: number;
}

export interface WorkerResult {
  workerId: string;
  name: string;
  specialty: string;
  recommendation: string;
  confidence: number;
  priceHbar: number;
  paymentAccount: string;
  evidence: string;
}

export interface PaymentResult {
  status: 'success' | 'payment_failed' | 'skipped_plan_only';
  transactionId?: string;
  network: string;
  amountHbar: number;
  recipient: string;
  consensusTimestampMs?: number;
  error?: string;
}

export interface CarbonRetirement {
  verified: boolean;
  retiredTons: number; // tCO2e retired / credited
  calcMethod: string;
  eligibleCleanMwh: number;
  evidence: string;
  hcsSequence?: string;
  retirementTxId?: string; // HTS transfer/burn if performed
}

export interface WvVerificationReceipt {
  version: string;
  network: string;
  timestamp: number;
  taskHash: string;
  energyDataHash: string; // batch.dataHash
  batchId: string;
  period: string;
  votes: Array<{
    workerId: string;
    name: string;
    specialty: string;
    confidence: number;
    priceHbar: number;
    paymentAccount: string;
    score: number;
  }>;
  selected: {
    workerId: string;
    name: string;
    specialty: string;
    priceHbar: number;
    paymentAccount: string;
    score: number;
  };
  payment: PaymentResult;
  carbon: CarbonRetirement;
  decisionHash: string;
  hcsMessage?: {
    topicId: string;
    sequenceNumber?: string;
    transactionId?: string;
  };
  proofStatus: 'mainnet_confirmed' | 'not_mainnet_proof';
  explorerUrl?: string;
  mirrorNodeUrl?: string;
  hcsUrl?: string;
}

export interface PaymentRail {
  transfer(toAccountId: string, amountHbar: number, memo?: string): Promise<PaymentResult>;
}

export interface HcsPublishResult {
  status: 'success' | 'failed';
  sequenceNumber?: string;
  topicId: string;
  transactionId?: string;
  consensusTimestamp?: string;
  error?: string;
}
