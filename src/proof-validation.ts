/**
 * Simple receipt guard (plan vs mainnet)
 */
import { WvVerificationReceipt } from './types.js';

export function assertMainnetProofReceipt(receipt: WvVerificationReceipt) {
  if (receipt.proofStatus !== 'mainnet_confirmed') {
    throw new Error('Receipt is not a live mainnet proof (plan-only or failed payment).');
  }
}
