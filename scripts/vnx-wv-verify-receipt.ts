#!/usr/bin/env tsx
/**
 * Simple receipt verifier (local hash checks + structure).
 * For full Hiero mirror + HCS verification see the core hedera-vnx-paid-swarm HieroVerifyVnxAgent.
 */
import { readFileSync } from 'fs';
import { Command } from 'commander';
import { WvVerificationReceipt } from '../src/types.js';
import { createHash } from 'crypto';

const program = new Command();
program
  .name('vnx-wv-verify')
  .argument('<receipt.json>', 'Path to saved WvVerificationReceipt')
  .option('--task <text>', 'Original task description for hash check')
  .parse(process.argv);

const [receiptPath] = program.args;
const opts = program.opts();

const raw = readFileSync(receiptPath, 'utf8');
const receipt: WvVerificationReceipt = JSON.parse(raw);

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

let ok = true;
console.log('VNX WV Carbon Swarm Receipt Verifier\n');

if (opts.task) {
  const recomputedTask = sha256(opts.task);
  if (recomputedTask !== receipt.taskHash) { console.log('FAIL TASK HASH'); ok = false; } else console.log('PASS TASK HASH');
}

const decisionPayload = `${receipt.selected.workerId}:${receipt.selected.score}:${receipt.payment.transactionId ?? 'no-tx'}:${receipt.taskHash}:${receipt.energyDataHash}:${receipt.carbon.retiredTons}`;
const recomputedDecision = sha256(decisionPayload);
if (recomputedDecision !== receipt.decisionHash) { console.log('FAIL DECISION HASH'); ok = false; } else console.log('PASS DECISION HASH');

if (receipt.carbon.verified && receipt.carbon.retiredTons > 0) {
  console.log('PASS CARBON RETIREMENT CLAIMED');
} else {
  console.log('INFO: No carbon retirement triggered in this receipt');
}

console.log(ok ? '\nVERDICT: ACCEPTED (local hashes match)' : '\nVERDICT: REJECTED — hashes do not match or tampered');
process.exit(ok ? 0 : 1);
