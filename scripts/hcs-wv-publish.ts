#!/usr/bin/env tsx
// Thin wrapper to publish a manual WV retirement attestation to the Vera Lattice HCS topic.
// Mostly for testing / one-off.
import { WvHcsPublisher } from '../src/hcs-publisher.js';
import { Command } from 'commander';

const program = new Command();
program
  .requiredOption('--batch <id>')
  .requiredOption('--tons <n>')
  .option('--period <p>', '2026-05')
  .parse();

const opts = program.opts();
const topic = process.env.VNX_HCS_TOPIC_ID || '0.0.10416185';
const account = process.env.HEDERA_ACCOUNT_ID!;
const pk = process.env.HEDERA_PRIVATE_KEY!;

if (!account || !pk) { console.error('Need HEDERA_ creds'); process.exit(1); }

const pub = new WvHcsPublisher({ topicId: topic, accountId: account, privateKey: pk });
const msg = {
  type: 'vnx.wv.energy.verified.carbon.retired' as const,
  batchId: opts.batch,
  period: opts.period || '2026-05',
  energyDataHash: 'manual',
  decisionHash: 'manual',
  winnerWorker: 'manual',
  verified: true,
  retiredTons: parseInt(opts.tons, 10),
  calcMethod: 'manual-cli',
  timestamp: Date.now(),
  version: '1.0.0',
};
pub.publish(msg).then(r => { console.log(r); pub.close(); });
