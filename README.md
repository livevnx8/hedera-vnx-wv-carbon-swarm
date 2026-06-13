# hedera-vnx-wv-carbon-swarm

**VNX BitLattice Verification Swarm for West Virginia energy usage & production data — end-to-end cryptographically verified carbon credit retirement on Hedera.**

> **VNX + BitLattice works very well across this domain.**  
> The same primitives (specialist BitLattice-named prover workers + deterministic confidence scoring + winner selection + SHA-256 receipts + HBAR micro-settlement + HCS anchoring to the shared Vera Lattice topic `0.0.10416185`) that power trading-signal swarms also excel at **real-world verification and credit retirement** use cases. Energy data → carbon credit retirement is just one instance. The pattern generalizes cleanly to renewable energy certificates, water/biodiversity credits, supply-chain provenance, AI inference attestations, RWA claims, compliance reports, and more.  
> The core `hedera-vnx-paid-swarm` provides the reusable engine; each domain only supplies the specialist workers (via `AgentRegistry` or simple arrays) + any post-decision domain logic (e.g. retirement calc + typed HCS message).

This repo is a complete, self-contained demonstration of the generalized pattern.

## What it does (end-to-end)

1. Ingest a structured WV energy batch (generation by source, period, provenance hash).
2. Swarm of 4 specialized BitLattice verifiers scores the verification task.
3. Highest-scoring worker "wins" (paid tiny HBAR).
4. Deterministic carbon calc (clean tranche × displacement factor) produces retirement quantity.
5. If swarm consensus verifies the batch → retirement record is published as a typed HCS message on the Vera Lattice topic.
6. You get a single receipt JSON linking:
   - EIA/WV data hash
   - Swarm decision hash (which BitLattice worker + score)
   - HBAR payment tx (if live)
   - HCS sequence for the retirement attestation
   - HashScan / mirror URLs

Any third party can independently replay the hashes and Hedera records for zero-trust verification.

## Quick Start

```bash
cd hedera-vnx-wv-carbon-swarm
npm install

# Plan-only (no creds, no network, shows full flow + sample retirement)
npm run demo:plan

# Live (requires .env with mainnet operator that has a few HBAR)
cp .env.example .env
# edit HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY
npm run demo:live
```

## Sample Output (plan)

(See terminal after `npm run demo:plan` — it uses a "high clean" May 2026 WV batch with ~1.5M+ MWh clean tranche → hundreds of tCO2e retired.)

## Workers (BitLattice Verification Swarm)

| Worker                | Specialty              | Focus |
|-----------------------|------------------------|-------|
| BitLattice-DataProver | lattice-verification   | Data integrity, provenance hash, BitLattice-style prover checks |
| Emissions-Lattice     | emissions              | CO₂ calc, avoided emissions, tCO2e quantification |
| Grid-WV-Auditor       | grid-audit             | WV grid mix validation vs known high-carbon baseline |
| Retire-PolicyGate     | retirement-policy      | Eligibility gate + final credit retirement approval |

Scoring & dispatch logic is identical in spirit to the core `hedera-vnx-paid-swarm`.

## Carbon Retirement

- Primary trust anchor: **HCS message on 0.0.10416185** (`vnx.wv.energy.verified.carbon.retired`)
- Optional future: HTS token transfer/burn of a carbon credit token (scaffold present in carbon-recorder.ts)
- The receipt + HCS message together constitute the "retired for verified credit" proof.

## Integration with the rest of the stack

- Reuses the same HCS Vera Lattice topic as `hedera-vnx-paid-swarm`
- Same receipt + mirror node verification philosophy
- Can be driven by `hedera-realtime-charts` or `hedera-ml-pipeline` for live data feeds
- Frontend hooks possible in `verlattice` (Next.js)

## Data

- Uses deterministic sample batches (realistic WV coal-heavy + clean growth)
- `energy-adapter.ts` has `fetchWvEnergyBatch` stub — replace with real EIA API calls (v2 electricity data) + signature or oracle for production provenance.
- Batches are hashed at source for tamper evidence.

## Live Mainnet Proofs

When you run live you will see:
- Real HBAR micro-payment to one of the verifier accounts (0.0.10294xxx range)
- Real HCS message seq on the public Vera Lattice topic
- Receipt you can hand to auditors with the full hash chain

## Verify a receipt

```bash
npm run verify -- data/receipt-example.json --task "the original task text"
```

## The Pattern Across Domains

The VNX BitLattice swarm is a **verification primitive**, not a trading-only tool.

**How to build a new domain swarm (30-60 min):**

1. Define your domain data shape (e.g. `SupplyChainClaim`, `AiInferenceBatch`).
2. Implement `bitlatticeVerifyX(data)` – the lattice constraint checker (sums, hashes, bounds, cross-source consistency, policy rules).
3. Create 3-5 `VnxWorkerAgent` (or registry records) with domain specialties (e.g. `provenance-prover`, `sustainability-gate`, `zk-evidence-auditor`).
4. Use (or copy) `PaidSwarmCoordinator` / `VnxSwarmClient` + `AgentRegistry` for the vote + pay + receipt engine.
5. After winner selection, run your domain outcome (retire credits, issue attestation, burn token, publish rich HCS message).
6. Anchor everything on the shared Vera Lattice HCS topic for unified auditability.
7. Produce an extended receipt with your domain hashes + outcome.

Existing examples:
- Trading signals (core `hedera-vnx-paid-swarm`, BitLattice-ONNX etc.)
- West Virginia energy → verified carbon retirement (this repo)
- (Next) supply chain, water credits, model cards, etc.

The BitLattice naming + lattice prover functions make the "swarm of provers" concept concrete and auditable.

## License

MIT © Vera Lattice / livevnx8

See also:
- https://github.com/livevnx8/hedera-vnx-paid-swarm (core VNX paid swarm this is built on the pattern of)
- https://github.com/livevnx8/hedera-vnx-wv-carbon-swarm (this repo – full verification domain example)
- BitLattice concepts (historical DLT inspiration for the prover swarm model)
- Hedera HCS for public immutable audit trails
