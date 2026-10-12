# ReleaseGate

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![Expo](https://img.shields.io/badge/Expo-SDK_57-black.svg)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React_Native-0.86.3-61dafb.svg)](https://reactnative.dev/)
[![Solana](https://img.shields.io/badge/Solana-Devnet-14F195.svg)](https://solana.com/)

**ReleaseGate** is a native Android application and cryptographic verification framework for reviewing and authorizing Solana program upgrades through existing Squads multisig vaults.

Its core promise:
> **"Approve these exact program bytes against this deployment state. If those conditions change, execution stops."**

---

## 1. The Vulnerability in Standard Multisig Upgrades

In standard Solana multisig workflows, upgrading an on-chain program involves pointing a Squads proposal to an external buffer account containing new ELF bytecode. This model contains two severe vulnerabilities:

### 1.1 Out-of-Order Execution & Silent Rollbacks
Suppose a security patch (**Release A**) and a subsequent feature release (**Release B**) are both proposed and approved against the same current deployment state ($S_0$):
1. **Release B executes first**, upgrading the on-chain program to slot $S_1$.
2. In Squads v4, proposals only become stale when multisig membership or threshold configurations change. Approved proposals remain executable indefinitely.
3. An unsuspecting team member or malicious actor can subsequently execute Release A. Squads permits the execution, **silently replacing Release B with Release A** and rolling back the protocol to an obsolete version.

### 1.2 Buffer Mutation & Substitution
A buffer account is referenced by address in the proposal. If the buffer is mutable before execution, a compromised or rogue proposer can modify byte ranges or substitute binary payloads between approval and execution.

---

## 2. The ReleaseGate Guard

ReleaseGate replaces unguarded upgrade proposals with a **canonical 5-instruction atomic guard** inside the Squads stored `VaultTransaction`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Squads VaultTransaction                           │
│                                                                        │
│  1. Assert Buffer Owner      (Lighthouse: Owner == BPF Loader)         │
│  2. Assert Buffer Length     (Lighthouse: DataLength == 37 + ELF)      │
│  3. Assert Buffer Keccak     (Lighthouse: Keccak256 == reviewed_hash)  │
│  4. Assert Deployment Slot   (Lighthouse: ProgramData.slot == S0)      │
│  5. BPF Loader Upgrade       (Loader v3: Upgrade program from buffer)  │
└────────────────────────────────────────────────────────────────────────┘
```

### What the Guard Guarantees
- **Byte Authenticity:** Asserts that the buffer is owned by the BPF Loader and that its byte length and Keccak-256 digest match the reviewed release artifact.
- **State Determinism:** Asserts that `ProgramData.slot == S0`. If any earlier upgrade has executed and advanced the deployment slot, assertion #4 fails atomically with Lighthouse error `0x1771` (`6001`), halting the upgrade and preserving the deployed program.
- **Controlled Rollback:** An intentional rollback cannot execute blindly; it requires an explicit fresh proposal and renewed multi-member review.

> **Important Boundary:** A matching hash proves that the bytes in the buffer are the exact bytes the reviewer imported. It does not establish that the underlying code is harmless, safe, or audited.

---

## 3. Architecture Overview

ReleaseGate follows strict hexagonal architecture: a pure, deterministic verification core (`release-core`) with zero UI dependencies, surrounded by mobile and desktop shells.

```
ReleaseGate/
├── apps/mobile/                  # Native Android app (Expo SDK 57, React Native 0.86, New Architecture)
│   ├── navigation/               # Type-safe routing across workspace, review, and actions
│   ├── features/workspace/       # Cluster selection, RPC genesis check, Squads multisig entry
│   ├── features/wallet/          # Direct Mobile Wallet Adapter (MWA) sessions & cached authorization
│   ├── features/release-import/  # File picker & Android share receiver, SHA-256 blob store, reviewer attestation
│   ├── features/proposal-review/ # Coordinated 2-read on-chain fetching, 28-check verification, 8-section UI
│   ├── features/guarded-proposal/# Canonical 5-instruction proposal builder and replacement creation
│   ├── features/voting/          # Approve and reject controls with MWA transaction signing
│   ├── features/execution/       # Separately gated upgrade execution with preflight simulation
│   ├── features/receipts/        # Post-execution on-chain reconciliation and receipt display
│   ├── features/recovery/        # Durable operation journal and idempotent recovery pipeline
│   ├── platform/                 # Atomic document store, SHA-256 blob store, RPC client, polyfills
│   └── ui/                       # Shared accessible UI design system (buttons, cards, badges)
├── packages/release-core/        # Pure TypeScript verification and governance engine (Node & Hermes)
│   ├── cluster/                  # Genesis hashes, canonical program IDs, cluster comparison
│   ├── loader-v3/                # BPF Upgradeable Loader state codecs & Upgrade instruction
│   ├── lighthouse/               # Canonical Lighthouse assertion codecs (LEB128, operators, errors)
│   ├── digest/                   # Keccak-256, literal SHA-256, verified-build SHA-256
│   ├── manifest/                 # Release manifest schema, JSON validation, artifact binding
│   ├── squads/                   # Squads v4 account deserialization, permissions, instruction builders
│   ├── inspection/               # Stored transaction classification, signer/writable normalization
│   ├── guard/                    # Canonical 5-instruction guard template generation & shape matching
│   ├── verification/             # 28 individual verification checks (identity, buffer, deployment, etc.)
│   ├── policy/                   # ReviewVerdict generation, permissions gating, timelock evaluation
│   ├── receipt/                  # Deployment receipt generation & post-execution reconciliation
│   ├── settlement/               # Operation outcome state machine & Table 1 effect predicates
│   └── chain/                    # Read-only chain interface & Solana web3.js connection adapter
├── tools/prepare-release/        # Node.js CLI desktop preparation tool for releases, staging, and probing
├── programs/release-demo/        # Upgradeable test program (pinocchio) with v1 linear & v2 quadratic transforms
└── evidence/                     # Verifiable on-chain ceremony records, local SVM lifecycle, and submission docs
```

---

## 4. Getting Started & Reproducing

### 4.1 Prerequisites
- **Node.js:** `>= 20.20.2`
- **JDK:** `OpenJDK 17`
- **Android SDK:** Platform 36, Build Tools 36.0.0
- **Rust:** `>= 1.80` (for building the demo program)

### 4.2 Installation
```bash
npm install
```

### 4.3 Typecheck
Run type-checking across all three workspaces (`release-core`, `mobile`, `prepare-release`):
```bash
npm run typecheck
```

### 4.4 Automated Test Suite
Run the 187 unit tests (172 core, 12 mobile, 3 CLI):
```bash
npm test
```

### 4.5 Local SVM Lifecycle Validation
Execute the 14-step offline SVM lifecycle replay validating mainnet and devnet Squads builds against Lighthouse:
```bash
node evidence/local-validation/core_lifecycle.mjs both
```

### 4.6 Building the Android App
To compile the standalone release APK:
```bash
cd apps/mobile/android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64
```
The signed APK lands at:
`apps/mobile/android/app/build/outputs/apk/release/app-release.apk`

---

## 5. Public Evidence & Verification Index

All claims in this project are substantiated by publicly verifiable records in [`evidence/`](file:///home/azureuser/Proceed%20with%20ReleaseGate/evidence/README.md):

1. **On-Chain Devnet Ceremony:** [`evidence/devnet/ceremony/`](file:///home/azureuser/Proceed%20with%20ReleaseGate/evidence/devnet/ceremony/)
   - Step 17: Release B executed on-chain at slot `510077654` (Sig: `44ZgDvmrAurTLYe...`).
   - Step 18: Out-of-order Release A attempted via desktop CLI (`--skip-preflight`), failing on-chain with Lighthouse error `0x1771` (Sig: `4dxCdeExr94nMDS...`).
   - Step 19: Intentional rollback executed via counterpart Release A′ (Sig: `4s5JvEY5xbq7j...`).

2. **Verify Blocked Transaction Directly with Solana CLI:**
   ```bash
   solana confirm -v 4dxCdeExr94nMDSXZgGXwhqy8vaDCReRZVvhvWwThMTXnTDjqFuS3RkXMm5sZxC4SweuhWt4qynzYdqfUcx9iz7 --url https://api.devnet.solana.com
   ```
   *Output shows:*
   ```text
   Program L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95 invoke [2]
   Program log: Instruction: AssertUpgradeableLoaderAccount
   Program log: Result (Failed): Some(510077654) == Some(510053608)
   Program L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95 failed: custom program error: 0x1771
   ```

3. **Standalone Release APK:**
   - **File:** `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
   - **SHA-256 Checksum:** `8817477b1fe4e4f9d85b8602b3cfdc901cb0bbfecb6c47c44f93f10c077b3b09`
   - **Signature Verification:** Verified with Android SDK `apksigner` (v2 scheme, `CN=ReleaseGate`).
   - **Submission Package:** [`evidence/submission/`](file:///home/azureuser/Proceed%20with%20ReleaseGate/evidence/submission/README.md)

4. **Physical Device Validation:**
   - Run sheet: [`evidence/device/physical/RUN_SHEET.md`](file:///home/azureuser/Proceed%20with%20ReleaseGate/evidence/device/physical/RUN_SHEET.md)
   - Emulator records: [`evidence/device/emulator-mock-wallet/`](file:///home/azureuser/Proceed%20with%20ReleaseGate/evidence/device/emulator-mock-wallet/)

---

## 6. Known Limits

- **Cluster Scope:** In this version, transaction signing (proposal creation, approval, rejection, execution) is enabled on Devnet only. Mainnet-beta is selectable as review-only.
- **Unsupported Instructions:** Complex transactions (spending limits, multisig config changes, token transfers, arbitrary CPI) are decoded for display and strictly classified as unsupported; no actions are provided for them.
- **On-Device Hashing:** Computing full Keccak-256 and SHA-256 digests over a 2 MB binary in JavaScript on mobile takes approximately 1–3 seconds. Progress indicators ensure the UI remains responsive.
- **SIMD-0433 Regime:** The feature account `EhisBfVtGvEA8bVCVN5VMaYEaX6iTfoUrmcDi8LY7Kxy` remains unactivated on Solana networks. Upgrades currently retain zero-padded trailing bytes up to initial allocation, which ReleaseGate's receipt reconciliation accommodates and validates.

---

## 7. Pinned Toolchain & Dependencies

| Component | Pinned Version | Notes |
|---|---|---|
| Node.js | `20.20.2` | Engine constraint |
| React Native | `0.86.3` | New Architecture enabled |
| Expo SDK | `57.0.28` | Custom development build |
| `@solana/web3.js` | `1.98.4` | Pinned for Hermes compatibility |
| `@sqds/multisig` | `2.1.4` | Squads Protocol v4 SDK (isolated in core) |
| `@solana-mobile/mobile-wallet-adapter-protocol` | `2.3.0` | MWA 2.0 protocol |
| `@noble/hashes` | `1.8.0` | SHA-256 and Keccak-256 implementations |
| Pinocchio | `0.11.2` | Zero-dependency Solana SBF Rust crate |
| Solana CLI (Agave) | `4.3.0` | SBF build tools |

---

## 8. License

ReleaseGate is licensed under the [Apache License, Version 2.0](LICENSE).
Third-party attributions and dependency licenses are detailed in [NOTICE](NOTICE).
