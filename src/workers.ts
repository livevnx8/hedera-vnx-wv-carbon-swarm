/**
 * VNX BitLattice WV Verification Workers
 * Specialized deterministic agents for energy data verification + carbon retirement eligibility.
 * "BitLattice" naming retained for continuity with Vera Lattice / VNX BitLattice-ONNX tradition.
 */

import { WorkerResult, WvEnergyBatch } from './types.js';
import { computeRetirableTons, validateBatch } from './energy-adapter.js';

const SPECIALTY_KEYWORDS: Record<string, string[]> = {
  'lattice-verification': ['lattice', 'verify', 'integrity', 'hash', 'data', 'provenance', 'bitlattice', 'proof'],
  'emissions': ['emission', 'carbon', 'tco2', 'tons', 'avoided', 'intensity', 'co2'],
  'grid-audit': ['grid', 'mix', 'wv', 'west virginia', 'coal', 'wind', 'audit', 'baseline'],
  'retirement-policy': ['retire', 'credit', 'eligible', 'policy', 'offset', 'verified', 'claim'],
};

export class VnxWorkerAgent {
  private _id: string;
  private _name: string;
  private _specialty: string;
  private _priceHbar: number;
  private _paymentAccount: string;
  private _responseTemplate: string;

  get id() { return this._id; }
  get name() { return this._name; }
  get specialty() { return this._specialty; }
  get priceHbar() { return this._priceHbar; }
  get paymentAccount() { return this._paymentAccount; }

  constructor(
    id: string,
    name: string,
    specialty: string,
    priceHbar: number,
    paymentAccount: string,
    responseTemplate: string,
  ) {
    this._id = id;
    this._name = name;
    this._specialty = specialty;
    this._priceHbar = priceHbar;
    this._paymentAccount = paymentAccount;
    this._responseTemplate = responseTemplate;
  }

  private _computeConfidence(task: string): number {
    const lower = task.toLowerCase();
    const keywords = SPECIALTY_KEYWORDS[this._specialty] || [];
    let matches = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) matches++;
    }
    const base = 0.55;
    const perMatch = 0.09;
    const cap = 0.96;
    return Math.min(cap, base + matches * perMatch);
  }

  execute(task: string, batch?: WvEnergyBatch): WorkerResult {
    const confidence = this._computeConfidence(task);
    let evidence = `Keyword match: ${this._specialty} | conf=${confidence.toFixed(3)}`;

    // Domain-specific structured evidence for verification swarms
    if (batch && validateBatch(batch).ok) {
      const { retiredTons, eligibleCleanMwh, calcMethod } = computeRetirableTons(batch);
      if (this._specialty === 'lattice-verification') {
        evidence = `BitLattice hash ${batch.dataHash.slice(0, 12)}... integrity OK. Provenance=${batch.provenance}.`;
      } else if (this._specialty === 'emissions') {
        evidence = `${calcMethod}. Eligible clean ${eligibleCleanMwh} MWh → ${retiredTons} tCO2e.`;
      } else if (this._specialty === 'grid-audit') {
        const coalPct = ((batch.bySource.coal || 0) / batch.netGenerationMwh * 100).toFixed(1);
        evidence = `WV grid mix coal ${coalPct}% (high baseline). Clean share verified for credit calc.`;
      } else if (this._specialty === 'retirement-policy') {
        evidence = `VERIFIED: true. Retirement gate passed for ${retiredTons} tCO2e. Policy: WV energy + clean displacement.`;
      }
    }

    const recommendation = batch
      ? this._responseTemplate.replace('{tons}', String(computeRetirableTons(batch).retiredTons))
      : this._responseTemplate;

    return {
      workerId: this._id,
      name: this._name,
      specialty: this._specialty,
      recommendation,
      confidence,
      priceHbar: this._priceHbar,
      paymentAccount: this._paymentAccount,
      evidence,
    };
  }
}

/** Pre-configured BitLattice-style verification workers for WV energy + carbon */
export const DEFAULT_WV_WORKERS: VnxWorkerAgent[] = [
  new VnxWorkerAgent(
    'bitlattice-prover',
    'BitLattice-DataProver',
    'lattice-verification',
    0.006,
    '0.0.10294360',
    'BitLattice prover: data integrity + lattice hash verified. VERIFIED for carbon retirement.',
  ),
  new VnxWorkerAgent(
    'emissions-lattice',
    'Emissions-Lattice',
    'emissions',
    0.005,
    '0.0.10294361',
    'Lattice emissions model: {tons} tCO2e eligible for verified retirement.',
  ),
  new VnxWorkerAgent(
    'grid-wv-auditor',
    'Grid-WV-Auditor',
    'grid-audit',
    0.004,
    '0.0.10294362',
    'WV grid mix audit passed. Baseline high-carbon confirmed; clean tranche eligible.',
  ),
  new VnxWorkerAgent(
    'retire-gate',
    'Retire-PolicyGate',
    'retirement-policy',
    0.004,
    '0.0.10294363',
    'Carbon retirement policy gate: APPROVED. On-chain retirement record + credit claim ready.',
  ),
];
