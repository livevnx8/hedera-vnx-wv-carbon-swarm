# hedera-vnx-wv-carbon-swarm

**VNX BitLattice Verification Swarm for West Virginia energy usage & production data — end-to-end cryptographically verified carbon credit retirement on Hedera.**

Uses the livevnx8 / Vera Lattice tech stack:

- Deterministic VNX micro-swarm pattern (workers vote, highest score wins)
- BitLattice-* named verification agents (continuing the BitLattice-ONNX / lattice prover tradition)
- HBAR micro-payments to winning verifier on Hedera mainnet
- Cryptographic SHA-256 receipts (taskHash + decisionHash + energyDataHash)
- **HCS anchoring to the shared Vera Lattice audit trail topic (`0.0.10416185`)** used by the core hedera-vnx-paid-swarm
- On verified high-confidence decision → automatic computation of eligible tCO2e + retirement attestation published to HCS
- Full mirror-node + HashScan verifiability for the entire chain: raw energy data → swarm consensus → payment → carbon retirement record

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

## Architecture (text)

```
WV Energy Batch (EIA/provenance)
        │
        ▼
BitLattice Verification Swarm (4 workers vote)
        │ winner + score
        ▼
Hedera HBAR payment rail (micro)
        │
        ▼
Deterministic tCO2e calc + VERIFIED gate
        │
        ▼
HCS publish (Vera Lattice topic 0.0.10416185) : "vnx.wv...retired"
        │
        ▼
WvVerificationReceipt (all hashes + links)
        │
   HashScan / Mirror / HCS URLs  ← independently auditable
```

## License

MIT © Vera Lattice / livevnx8

See also:
- https://github.com/livevnx8/hedera-vnx-paid-swarm (core VNX paid swarm this is built on the pattern of)
- BitLattice concepts (historical DLT inspiration for the prover swarm model)
- Hedera HCS for public immutable audit trails
