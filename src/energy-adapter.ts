/**
 * WV Energy Data Adapter
 * Sample realistic West Virginia energy batches (coal-dominant grid + growing clean).
 * Includes deterministic hash + stub for live EIA data (public endpoints).
 */

import { createHash } from 'crypto';
import { WvEnergyBatch } from './types.js';

export function computeBatchHash(batch: Omit<WvEnergyBatch, 'dataHash'>): string {
  const canonical = JSON.stringify({
    id: batch.id,
    period: batch.period,
    state: batch.state,
    netGenerationMwh: batch.netGenerationMwh,
    bySource: batch.bySource,
    provenance: batch.provenance,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export const SAMPLE_WV_MAY_2026: WvEnergyBatch = {
  id: 'wv-2026-05-eia-001',
  period: '2026-05',
  state: 'WV',
  netGenerationMwh: 6_850_000,
  bySource: {
    coal: 4_850_000,
    natural_gas: 1_420_000,
    wind: 320_000,
    solar: 95_000,
    other: 165_000,
  },
  totalConsumptionMwh: 5_920_000,
  provenance: 'EIA',
  dataHash: '', // filled below
  sourceRef: 'EIA.ELEC.GEN.ALL-WV-ALL.M',
};
SAMPLE_WV_MAY_2026.dataHash = computeBatchHash(SAMPLE_WV_MAY_2026);

export const SAMPLE_WV_HIGH_CLEAN: WvEnergyBatch = {
  id: 'wv-2026-05-verified-clean-007',
  period: '2026-05',
  state: 'WV',
  netGenerationMwh: 6_120_000,
  bySource: {
    coal: 3_100_000,
    natural_gas: 1_100_000,
    wind: 1_150_000,
    solar: 420_000,
    other: 350_000,
  },
  totalConsumptionMwh: 5_410_000,
  provenance: 'verified',
  dataHash: '',
  sourceRef: 'internal-audit+ EIA crosscheck',
};
SAMPLE_WV_HIGH_CLEAN.dataHash = computeBatchHash(SAMPLE_WV_HIGH_CLEAN);

/**
 * Deterministic avoided emissions calc (tCO2e).
 * Rough factors for demo (real: use eGRID202x or EPA marginal factors for Appalachia).
 * Coal ~0.95 t/MWh displaced, gas ~0.4, clean sources get credit for displacement.
 */
export function computeRetirableTons(batch: WvEnergyBatch): {
  retiredTons: number;
  eligibleCleanMwh: number;
  calcMethod: string;
} {
  const cleanMwh = (batch.bySource.wind || 0) + (batch.bySource.solar || 0) + (batch.bySource.other || 0) * 0.6;
  const avoided = cleanMwh * 0.87; // conservative displacement of coal-heavy marginal
  const retired = Math.round(avoided);
  return {
    retiredTons: retired,
    eligibleCleanMwh: Math.round(cleanMwh),
    calcMethod: 'vnx-wv-v0.1: cleanMwh * 0.87 (displaced coal/gas mix for WV)',
  };
}

/**
 * Simple live-ish fetch stub. In production would hit EIA v2 API with key.
 * For now returns one of the samples or throws in live if no key.
 */
export async function fetchWvEnergyBatch(period = '2026-05'): Promise<WvEnergyBatch> {
  // Demo: always return the high-clean verified sample for interesting retirement numbers
  if (period === '2026-05') {
    return { ...SAMPLE_WV_HIGH_CLEAN };
  }
  // Fallback to base sample
  return { ...SAMPLE_WV_MAY_2026 };
}

export function validateBatch(batch: WvEnergyBatch): { ok: boolean; reason?: string } {
  if (batch.state !== 'WV') return { ok: false, reason: 'Only WV supported' };
  const sum = Object.values(batch.bySource).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - batch.netGenerationMwh) > 10_000) {
    return { ok: false, reason: 'Source breakdown does not sum to netGeneration' };
  }
  if (!batch.dataHash || batch.dataHash.length !== 64) {
    return { ok: false, reason: 'Missing or invalid dataHash' };
  }
  return { ok: true };
}

/**
 * BitLattice-style consistency verification for an energy batch.
 * Treats the data fields as a "lattice" of constraints (sums, proportions, bounds, provenance).
 * Returns a score [0,1] and structured evidence. This is the "prover" heart of BitLattice workers.
 */
export function bitlatticeVerifyBatch(batch: WvEnergyBatch): {
  consistent: boolean;
  score: number;
  evidence: string;
  violations: string[];
} {
  const violations: string[] = [];
  let score = 1.0;

  const total = Object.values(batch.bySource).reduce((a, b) => a + b, 0);
  const clean = (batch.bySource.wind || 0) + (batch.bySource.solar || 0) + (batch.bySource.other || 0) * 0.7;
  const cleanShare = total > 0 ? clean / total : 0;

  // Lattice constraint 1: source sum matches net
  if (Math.abs(total - batch.netGenerationMwh) > 5000) {
    violations.push('source-sum-mismatch');
    score -= 0.25;
  }

  // Lattice constraint 2: reasonable WV coal-dominant mix (historical baseline ~70%+ coal)
  const coalShare = (batch.bySource.coal || 0) / total;
  if (coalShare < 0.35) {
    violations.push('coal-share-too-low-for-wv-baseline');
    score -= 0.15;
  }
  if (coalShare > 0.95) {
    violations.push('coal-share-extreme');
    score -= 0.1;
  }

  // Lattice constraint 3: clean share bounds for credit eligibility
  if (cleanShare < 0.05) {
    violations.push('insufficient-clean-for-retirement-claim');
    score -= 0.2;
  }

  // Lattice constraint 4: provenance & hash presence (tamper evidence)
  if (!['EIA', 'PJM', 'ISO', 'verified', 'manual'].includes(batch.provenance)) {
    violations.push('unknown-provenance');
    score -= 0.1;
  }
  if (!batch.dataHash || batch.dataHash.length < 16) {
    violations.push('weak-data-hash');
    score -= 0.3;
  }

  // Lattice constraint 5: consumption vs generation sanity (small import/export ok)
  if (batch.totalConsumptionMwh && Math.abs(batch.totalConsumptionMwh - total) > total * 0.4) {
    violations.push('consumption-generation-imbalance');
    score -= 0.1;
  }

  const consistent = violations.length === 0;
  const finalScore = Math.max(0, Math.min(1, score));

  const evidence = consistent
    ? `BitLattice lattice consistent (cleanShare=${(cleanShare * 100).toFixed(1)}%, coal=${(coalShare * 100).toFixed(1)}%). No constraint violations.`
    : `BitLattice violations: ${violations.join(', ')}. Adjusted score ${finalScore.toFixed(2)}.`;

  return { consistent, score: finalScore, evidence, violations };
}
