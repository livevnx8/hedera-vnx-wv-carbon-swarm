/**
 * Basic tests for WV Carbon Verification Swarm
 */
import { describe, it, expect } from '@jest/globals';
import { DEFAULT_WV_WORKERS } from '../src/workers.js';
import { SAMPLE_WV_HIGH_CLEAN, computeRetirableTons, validateBatch } from '../src/energy-adapter.js';
import { WvEnergyCarbonCoordinator } from '../src/coordinator.js';
import { HederaPaymentRail } from '../src/payment-rail.js';

describe('WV BitLattice Verification Swarm', () => {
  it('has 4 BitLattice-named verification workers', () => {
    expect(DEFAULT_WV_WORKERS.length).toBe(4);
    expect(DEFAULT_WV_WORKERS[0].name).toContain('BitLattice');
  });

  it('validates sample batch and computes retirement tons', () => {
    const v = validateBatch(SAMPLE_WV_HIGH_CLEAN);
    expect(v.ok).toBe(true);
    const { retiredTons, eligibleCleanMwh } = computeRetirableTons(SAMPLE_WV_HIGH_CLEAN);
    expect(retiredTons).toBeGreaterThan(1000);
    expect(eligibleCleanMwh).toBeGreaterThan(1500);
  });

  it('plan-only coordinator run produces valid receipt with carbon claim', async () => {
    const rail = new HederaPaymentRail({ requireMainnet: false, maxHbar: 0.01 });
    const coord = new WvEnergyCarbonCoordinator(
      DEFAULT_WV_WORKERS,
      { maxHbar: 0.01, planOnly: true, hcsTopicId: '0.0.10416185' },
      rail,
    );
    const receipt = await coord.run('Verify WV energy and retire carbon credits for verified clean tranche', SAMPLE_WV_HIGH_CLEAN);
    expect(receipt.batchId).toBe(SAMPLE_WV_HIGH_CLEAN.id);
    expect(receipt.energyDataHash).toHaveLength(64);
    expect(receipt.decisionHash).toHaveLength(64);
    expect(receipt.carbon.verified).toBe(true);
    expect(receipt.carbon.retiredTons).toBeGreaterThan(0);
    expect(receipt.payment.status).toBe('skipped_plan_only');
  });
});
