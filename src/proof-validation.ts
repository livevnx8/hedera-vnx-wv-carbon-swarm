/**
 * Simple receipt guard (plan vs mainnet)
 * BIND HCS-PAYMENT-RAIL-BIND-011: identity_status must be resolved for mainnet proof.
 */
import { WvVerificationReceipt } from './types.js';

export function assertMainnetProofReceipt(receipt: WvVerificationReceipt) {
  if (receipt.identity_status === 'unresolved' || receipt.identity_status === 'disagreement' || !receipt.identity_status) {
    throw new Error(
      `Receipt is not confirmed mainnet proof: identity_status is ${receipt.identity_status ?? 'missing'}`,
    );
  }
  if (receipt.proofStatus !== 'mainnet_confirmed') {
    throw new Error('Receipt is not a live mainnet proof (plan-only or failed payment).');
  }
}
