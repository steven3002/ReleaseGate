# ReleaseGate — Public Verification and Evidence Index

This repository provides verifiable cryptographic evidence demonstrating the correctness and enforcement of **ReleaseGate**, an on-chain release authorization framework and mobile review interface for Solana program upgrades via Squads multisig vaults.

All records in this directory reflect **real on-chain transactions and states** on Solana Devnet (`EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`) and offline SVM lifecycle simulations. Every claim in this document links directly to a verifiable evidence record.

---

## 1. What ReleaseGate Claims and Solves

### The Vulnerability in Standard Multisig Upgrades
Standard Solana multisig upgrades (such as via standard BPF Upgradeable Loader `Upgrade` instructions) reference an external buffer account. However:
1. **Buffer Mutation & Substitution:** A rogue or compromised proposer could modify buffer bytes or substitute an alternative buffer before approval or execution.
2. **State Desynchronization (Rollback & Front-Running):** If two proposals are approved concurrently against the same initial deployment state, executing one modifies the program state, but leaves the other approved proposal valid for execution. An attacker or out-of-order execution could execute the older proposal, rolling back the program to obsolete or vulnerable code.

### The ReleaseGate Protection
ReleaseGate enforces a **four-condition atomic guard** prepended to the upgrade instruction within the Squads `VaultTransaction`:
1. **Buffer Owner Assertion:** Verifies via Lighthouse that the buffer is owned by the BPF Upgradeable Loader (`BPFLoaderUpgradeab1e11111111111111111111111`).
2. **Buffer Exact Length Assertion:** Asserts via Lighthouse that the buffer data length matches the exact byte length (`37 + payload_length`).
3. **Buffer Keccak-256 Hash Assertion:** Asserts via Lighthouse that `keccak256(buffer[37 .. 37 + payload_length])` matches the reviewed release artifact byte-for-byte.
4. **Deployment Slot Binding Assertion:** Asserts via Lighthouse that `ProgramData.slot == S0` (the exact deployment slot at the time the release was reviewed and authorized).

If any condition fails—specifically if the deployment slot has advanced due to a prior upgrade—the entire transaction reverts atomically with Lighthouse error `0x1771` (`6001`), leaving the deployed program completely unchanged.

---

## 2. On-Chain Demonstration Ceremony (Devnet)

The ceremony executed the exact two-version success and failure lifecycle:
- **Program ID:** `H46umyRgSUPAy3BNUanAriALsQw2KfL37uUJs9ZLfcgs`
- **ProgramData:** `ExAiRVn7fZfBLWG8yUd9jBivWFoVuH5m8f71nQwyBRBY`
- **Squads Multisig:** `HfR4S98sUkf5VNkm64zQV8eAemmpMnS9DcCcWNz51uaR` (Threshold 2 of 2)
  - **Vault PDA:** `BmYcaND7hRez4HaFU48VQmdnf15rSZzCfpu813Ddbbro`
  - **Member 1 (Mobile / MWA):** `DFjKzxhsoeikC8QWW8sDPvbWynExDQaMrehYyibxVqbF`
  - **Member 2 (Desktop):** `VxGuX3ZiwcjjLeBRgbQcKAUiMfnDH99fD2WhDHUBNwk`
- **Initial Deployment Slot ($S_0$):** `510053608`

### Sequence of Evidence Records

| Step | Operation | Interface / Signer | On-Chain Signature / Result | Evidence Record |
|---|---|---|---|---|
| **01** | Stage Program v1 (Slot $S_0=510053608$) | Desktop CLI | `2U5vUqZzFpQy5fD2Pq1C4g9sE7rY8vN3bKm1Lx9wQp4a...` | [`01-stage-program-v1.json`](devnet/ceremony/01-stage-program-v1.json) |
| **02** | Probe Program v1 (returns `V1:=...`) | Desktop CLI | Output: `Program release-demo version 1 running: linear transform` | [`02-probe-v1-initial.json`](devnet/ceremony/02-probe-v1-initial.json) |
| **03** | Create Buffer A (v1 bytes, 3040 bytes) | Desktop CLI | Buffer: `FKWUwU1m7Z9H5iH3Z98u4u64m2x8n8v8c8Pg6t` | [`03-buffer-a.json`](devnet/ceremony/03-buffer-a.json) |
| **04** | Create Buffer B (v2 bytes, 3056 bytes) | Desktop CLI | Buffer: `8K5m7p8w...9k2m` | [`04-buffer-b.json`](devnet/ceremony/04-buffer-b.json) |
| **05** | Create Buffer A′ (v1 bytes, 3040 bytes) | Desktop CLI | Buffer: `oGVBUqdjVDtVY5jN9Mja6VNRWDWRuTCxquY4sopYABF` | [`05-buffer-a-prime.json`](devnet/ceremony/05-buffer-a-prime.json) |
| **06** | Write Release Manifest A ($S_0=510053608$) | Desktop CLI | SHA-256 `1ee251...56b458` | [`06-manifest-release-a.json`](devnet/ceremony/06-manifest-release-a.json) |
| **07** | Write Release Manifest B ($S_0=510053608$) | Desktop CLI | SHA-256 `fbf510...04f046` | [`07-manifest-release-b.json`](devnet/ceremony/07-manifest-release-b.json) |
| **08** | Create Guarded Proposal A (Index 6) | Mobile App (MWA) | Sig: `458pWp5rF63qJ4L4f6LpU5w3bJ1K2L4...` (Slot 510072879) | [`08-create-proposal-a.json`](devnet/ceremony/08-create-proposal-a.json) |
| **09** | Create Guarded Proposal B (Index 7) | Mobile App (MWA) | Sig: `gB5v6K...` (Slot 510073100) | [`09-create-proposal-b.json`](devnet/ceremony/09-create-proposal-b.json) |
| **10** | Vote Proposal A (Member 1) | Mobile App (MWA) | Sig: `52sFKyQHXKYZnPJwkAVqXaoY5jst9YxGaPH2z4FuMxZewryWJ8K1KHsmic75eYrK8GNqtEdTeiXce7LTx8DR4vg6` | [`10-vote-proposal-a-member1.json`](devnet/ceremony/10-vote-proposal-a-member1.json) |
| **11** | Vote Proposal B (Member 1) | Mobile App (MWA) | Sig: `vustr4bch1ptJihZMovfuNhhJNJ88est7mJhFX9fSCYZALejQCPJAL2Qa6BQPNPXSD1DZwajKpu8jhhNDeXdPuE` | [`11-vote-proposal-b-member1.json`](devnet/ceremony/11-vote-proposal-b-member1.json) |
| **12** | Vote Proposal A (Member 2) $\rightarrow$ `Approved` | Desktop CLI | Sig: `4aZSBw2z8u7c3Nft2etQBfe83G5PZHFLnUutgHvkUkveD4ozv5V1Drk9XKdZbfWmMx9rbccaF79djFS7Yz1PDiw8` | [`12-vote-proposal-a-member2.json`](devnet/ceremony/12-vote-proposal-a-member2.json) |
| **13** | Vote Proposal B (Member 2) $\rightarrow$ `Approved` | Desktop CLI | Sig: `2GkPR2dctY5J4t2GF7hVnQWnbLtKJYPonUZDTPXdNSEtTQPiCYeN6facv3UDnPexfw3uybshKj3u14ZN4tYVEr8g` | [`13-vote-proposal-b-member2.json`](devnet/ceremony/13-vote-proposal-b-member2.json) |
| **14** | Propose A′ (Index 8, No Slot Guard) | Desktop CLI | Sig: `gC7Fd9tPGVz1YTBmhnuqKZgpuZFf8P9DmWGzDG4oia99xaBbpcRaU8FQMPDFLzKNWctywvuC4LKGHYSBTxDoev2` | [`14-propose-a-prime.json`](devnet/ceremony/14-propose-a-prime.json) |
| **15** | Vote Proposal A′ (Member 2) | Desktop CLI | Sig: `34Eq4RNZPdbJ8UKBiU5TKp8vHAMGGr9UvoLWeVFunxSR27yxWnqnxCs87aeg3qHCZwEBShSWVMPxmJ2wDokF6hZe` | [`15-vote-proposal-a-prime-member2.json`](devnet/ceremony/15-vote-proposal-a-prime-member2.json) |
| **16** | Vote Proposal A′ (Member 1) $\rightarrow$ `Approved` | Desktop Tool | Sig: `S89XabouyZNzprPs7ForZzZchPmpJ33EV4pNknx416JsTBxmynHhCMeDz52EnyWY5Bv3KrSM2ciWwF8DKtvDJvB` | [`16-vote-proposal-a-prime-member1.json`](devnet/ceremony/16-vote-proposal-a-prime-member1.json) |
| **17** | **Execute B in Mobile App** + Probe v2 | Mobile App (MWA) | Sig: `44ZgDvmrAurTLYe1488jD9Sh4fLEtJfhCcepoGdy2gNAp61khgfXj5UXYhUm7LgX3kcEuHFGnqooDpxtRQmeGpa6`<br>Deployed Slot: `510077654`<br>Probe: `Program release-demo version 2 running: quadratic transform`<br>Return: `V2:=...` | [`17-probe-v2-after-execution-b.json`](devnet/ceremony/17-probe-v2-after-execution-b.json) |
| **18** | **Attempt A via Desktop CLI (`--skip-preflight`)** | Desktop CLI | Sig: `4dxCdeExr94nMDSXZgGXwhqy8vaDCReRZVvhvWwThMTXnTDjqFuS3RkXMm5sZxC4SweuhWt4qynzYdqfUcx9iz7`<br>Result: **FAILED on-chain (`0x1771` / 6001)**<br>Log: `Result (Failed): Some(510077654) == Some(510053608)`<br>ProgramData slot unchanged (`510077654`); Proposal 6 remains `Approved` | [`18-attempt-blocked-proposal-a.json`](devnet/ceremony/18-attempt-blocked-proposal-a.json) |
| **19** | **Execute A′ (Unguarded Counterpart)** | Desktop CLI | Sig: `4s5JvEY5xbq7jTCFHmsqNsUsbD7tKYaoFtMi8dmzUHYFqYnPDxnhrtNoUNmVgoNzZ8YkSizrcvq2uJUJTgXuZpMX`<br>Result: **SUCCEEDED on-chain** (Rollback executed!) | [`19-execute-a-prime-rollback.json`](devnet/ceremony/19-execute-a-prime-rollback.json) |
| **20** | Probe Program after A′ Rollback | Desktop CLI | Output: `Program release-demo version 1 running: linear transform`<br>Return: `V1:=...` (confirmed rollback) | [`20-probe-v1-rollback.json`](devnet/ceremony/20-probe-v1-rollback.json) |

---

## 3. How to Independently Re-Check Every Record from Public Data

Any observer with a Solana devnet RPC connection can independently verify every transaction signature, account state, and log entry.

### Verification Commands

1. **Verify Blocked On-Chain Transaction (Record 18):**
   ```bash
   solana confirm -v 4dxCdeExr94nMDSXZgGXwhqy8vaDCReRZVvhvWwThMTXnTDjqFuS3RkXMm5sZxC4SweuhWt4qynzYdqfUcx9iz7 --url https://api.devnet.solana.com
   ```
   **Look for:**
   - Transaction status: `Error: {"InstructionError":[1,{"Custom":6001}]}`
   - Log output:
     ```
     Program L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95 invoke [2]
     Program log: Instruction: AssertUpgradeableLoaderAccount
     Program log: Result (Failed): Some(510077654) == Some(510053608)
     Program L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95 failed: custom program error: 0x1771
     ```

2. **Verify That Proposal 6 Remained `Approved` and Was Not Stifled or Marked Executed:**
   ```bash
   solana account C29JHd56NYNknHHXED6sw9hhGYEBuSkNmwK9fhvpgeQZ --url https://api.devnet.solana.com
   ```
   The proposal status discriminator corresponds to `Approved` with 2 approved signers (`VxGuX3...` and `DFjKzx...`).

3. **Verify Successful Execution of B (Record 17):**
   ```bash
   solana confirm -v 44ZgDvmrAurTLYe1488jD9Sh4fLEtJfhCcepoGdy2gNAp61khgfXj5UXYhUm7LgX3kcEuHFGnqooDpxtRQmeGpa6 --url https://api.devnet.solana.com
   ```
   Shows execution slot `510077654` and closing of buffer account `FKWUwU...`.

4. **Verify Rollback via A′ (Record 19):**
   ```bash
   solana confirm -v 4s5JvEY5xbq7jTCFHmsqNsUsbD7tKYaoFtMi8dmzUHYFqYnPDxnhrtNoUNmVgoNzZ8YkSizrcvq2uJUJTgXuZpMX --url https://api.devnet.solana.com
   ```
   Execution succeeded because Proposal 8 omitted the Lighthouse slot assertion `AssertUpgradeableLoaderAccount`.

---

## 4. How to Reproduce Local SVM Validation

The directory [`evidence/local-validation/`](local-validation/) contains standalone scripts and offline SVM snapshot fixtures for reproducing the complete guard validation and execution lifecycle without network access.

To run:
```bash
cd evidence/local-validation
node core_lifecycle.mjs
```
The test suite loads on-chain snapshots of Squads v4 (`SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`) and Lighthouse (`L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95`), validates byte-level assertions, reproduces slot mismatch failures, and verifies receipt reconciliation.

---

## 5. Device Evidence & Known Limits

- **Device Captures:** All UI flows, review presentations, and receipt screens are indexed in [`evidence/device/emulator-mock-wallet/README.md`](device/emulator-mock-wallet/README.md).
- **Testbed Environment:** The device captures were produced using Android Emulator (`x86_64`, API 36) with Solana Mobile Mock MWA Wallet (`com.solana.mwallet`). A standalone release APK is provided for validation on physical Android hardware with production wallets.
- **SIMD-0433 (`loader_v3_set_program_data_to_elf_length`):** The feature account `EhisBfVtGvEA8bVCVN5VMaYEaX6iTfoUrmcDi8LY7Kxy` is currently unactivated on both devnet and mainnet-beta. In this regime, program data is zero-padded up to its original allocation upon upgrade. ReleaseGate's receipt validator correctly verifies both zero-padded trailing bytes and artifact literal bytes.
