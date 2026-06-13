/**
 * Proof URL helpers — HashScan + Mirror Node (reused pattern from VNX paid swarm)
 */

export function toHashScanTransactionUrl(txId: string): string {
  const encoded = encodeURIComponent(txId);
  return `https://hashscan.io/mainnet/transaction/${encoded}`;
}

export function toMirrorNodeTransactionUrl(txId: string): string {
  // Mirror node v1 tx id format uses @ replaced by - etc, but we link the pretty one
  const normalized = txId.replace('@', '-').replace('.', '-');
  return `https://mainnet-public.mirrornode.hedera.com/api/v1/transactions/${normalized}`;
}

export function toHashScanTopicUrl(topicId: string, seq?: string): string {
  if (seq) return `https://hashscan.io/mainnet/topic/${topicId}/${seq}`;
  return `https://hashscan.io/mainnet/topic/${topicId}`;
}
