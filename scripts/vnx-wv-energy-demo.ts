#!/usr/bin/env tsx
/**
 * CLI demo for WV Energy + Carbon Verification Swarm
 * Usage:
 *   npm run demo:plan
 *   npm run demo:live -- --task "..."   (requires .env creds)
 */

import { Command } from 'commander';
import { WvEnergyCarbonCoordinator } from '../src/coordinator.js';
import { HederaPaymentRail } from '../src/payment-rail.js';
import { DEFAULT_WV_WORKERS, createWvBitLatticeVerifiers } from '../src/workers.js';
import { fetchWvEnergyBatch, SAMPLE_WV_HIGH_CLEAN, bitlatticeVerifyBatch } from '../src/energy-adapter.js';
import { WvHcsPublisher, DryRunWvHcsPublisher } from '../src/hcs-publisher.js';
import { WvVerificationReceipt } from '../src/types.js';

const program = new Command();

program
  .name('vnx-wv-energy-demo')
  .description('VNX BitLattice West Virginia Energy Verification + Carbon Retirement Swarm demo')
  .option('--plan-only', 'Run without any network calls or payments (default for demo:plan)')
  .option('--live', 'Live mainnet mode (pays micro HBAR + HCS publish)')
  .option('--task <text>', 'Override task description', 'Verify West Virginia energy production May 2026, BitLattice integrity check, retire verified carbon credits for clean tranche')
  .option('--batch <id>', 'Use specific sample batch id (wv-2026-05-eia-001 or wv-2026-05-verified-clean-007)', 'wv-2026-05-verified-clean-007')
  .parse(process.argv);

const opts = program.opts();
const isLive = !!opts.live;
const planOnly = !!opts.planOnly || !isLive;

async function main() {
  console.log('=== VNX BitLattice WV Energy + Carbon Credit Verification Swarm ===\n');
  console.log(`Mode: ${planOnly ? 'PLAN-ONLY (no payments, no HCS)' : 'LIVE MAINNET'}\n`);

  const batch = opts.batch.includes('clean') ? SAMPLE_WV_HIGH_CLEAN : await fetchWvEnergyBatch('2026-05');

  console.log('WV Energy Batch:');
  console.log(JSON.stringify({
    id: batch.id,
    period: batch.period,
    netGenerationMwh: batch.netGenerationMwh,
    bySource: batch.bySource,
    provenance: batch.provenance,
    dataHash: batch.dataHash.slice(0, 16) + '...',
  }, null, 2));

  // Demonstrate the BitLattice lattice prover primitive (works for any domain data)
  const latticeCheck = bitlatticeVerifyBatch(batch);
  console.log(`\nBitLattice consistency check: score=${latticeCheck.score.toFixed(2)} consistent=${latticeCheck.consistent}`);
  console.log(`  ${latticeCheck.evidence}\n`);

  // Show the registry pattern (same as core hedera-vnx-paid-swarm AgentRegistry)
  const registryRecords = createWvBitLatticeVerifiers();
  console.log(`Registered ${registryRecords.length} BitLattice verifiers via createWvBitLatticeVerifiers() (ready for AgentRegistry or VnxSwarmClient in the core package):`);
  registryRecords.forEach(r => console.log(`  - ${r.name} (${r.specialty}) @ ${r.priceHbar} HBAR`));
  console.log('');

  const maxHbar = 0.01;
  const rail = new HederaPaymentRail({ requireMainnet: !planOnly, maxHbar });

  const topicId = process.env['VNX_HCS_TOPIC_ID'] || '0.0.10416185';

  let hcs: any = new DryRunWvHcsPublisher(topicId);
  if (!planOnly) {
    const accountId = process.env['HEDERA_ACCOUNT_ID'];
    const pk = process.env['HEDERA_PRIVATE_KEY'];
    if (accountId && pk) {
      hcs = new WvHcsPublisher({ topicId, accountId, privateKey: pk, network: 'mainnet' });
    } else {
      console.warn('[WARN] No Hedera creds in env — falling back to dry-run HCS publish.\n');
    }
  }

  const coordinator = new WvEnergyCarbonCoordinator(
    DEFAULT_WV_WORKERS,
    { maxHbar, planOnly, hcsTopicId: topicId },
    rail,
    hcs,
  );

  const receipt: WvVerificationReceipt = await coordinator.run(opts.task, batch);

  console.log('=== SWARM VERDICT + CARBON RETIREMENT RECEIPT ===\n');
  console.log(JSON.stringify(receipt, null, 2));
  console.log('\n=== END-TO-END VERIFICATION ===');
  console.log(`Task hash:        ${receipt.taskHash}`);
  console.log(`Energy data hash: ${receipt.energyDataHash}`);
  console.log(`Decision hash:    ${receipt.decisionHash}`);
  console.log(`Winner:           ${receipt.selected.name} (${receipt.selected.specialty}) score=${receipt.selected.score.toFixed(2)}`);
  console.log(`Worker paid:      ${receipt.payment.status} ${receipt.payment.amountHbar} HBAR → ${receipt.payment.recipient}`);
  console.log(`Carbon:           ${receipt.carbon.verified ? 'VERIFIED ✓' : 'NOT VERIFIED'} — ${receipt.carbon.retiredTons} tCO2e retired`);
  console.log(`  Method: ${receipt.carbon.calcMethod}`);
  if (receipt.hcsMessage) {
    console.log(`HCS Vera Lattice: topic=${receipt.hcsMessage.topicId} seq=${receipt.hcsMessage.sequenceNumber}`);
    console.log(`HCS URL: ${receipt.hcsUrl || '(see HashScan topic)'}`);
  }
  if (receipt.explorerUrl) console.log(`HashScan: ${receipt.explorerUrl}`);
  if (receipt.mirrorNodeUrl) console.log(`Mirror:   ${receipt.mirrorNodeUrl}`);

  console.log('\nThis receipt + HCS message on the shared Vera Lattice topic (0.0.10416185) provide cryptographic end-to-end proof:');
  console.log('  EIA/WV data → BitLattice swarm verification decision → HBAR settlement for worker → HCS anchored retirement attestation.');
  console.log('  Any party can re-validate the hashes and replay the mirror node / HCS messages.');

  if (hcs && typeof hcs.close === 'function') hcs.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
