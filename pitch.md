# ReleaseGate — Submission Pitch

## 1. What ReleaseGate Is and Who It Is For

**ReleaseGate** is a native Android application and on-chain verification framework designed for engineers and security reviewers who authorize Solana program releases as members of Squads multisigs.

Its core promise:
> **"Approve these exact program bytes against this deployment state. If those conditions change, execution stops."**

## 2. The Critical Failure It Prevents

In standard Solana multisig workflows, upgrading an on-chain program involves pointing a Squads proposal to a buffer account containing new ELF bytecode. This model contains two severe vulnerabilities:

1. **Buffer Mutation & Substitution:** The buffer account remains mutable until executed. A compromised or rogue release preparer could alter buffer bytes after approvals have already been gathered.
2. **Out-of-Order Execution & State Desynchronization:** Suppose Release A (a security patch) and Release B (a feature release) are proposed and approved concurrently against current deployed program state $S_0$. If Release B is executed first, the on-chain program advances to a new deployment slot ($S_1$). In Squads v4, previously approved proposals remain executable indefinitely because Squads only invalidates proposals when multisig membership or threshold configurations change. An unsuspecting member or malicious actor can subsequently execute Release A, silently rolling back the program to an older version and wiping out Release B.

### The ReleaseGate Solution

ReleaseGate constructs a **canonical 5-instruction guarded upgrade** inside the Squads stored `VaultTransaction`, prepending four atomic Lighthouse assertions before the BPF Upgradeable Loader `Upgrade` instruction:
- **Buffer Owner:** Asserts loader ownership (`BPFLoaderUpgradeab1e11111111111111111111111`).
- **Buffer Exact Length:** Asserts exact account size (`37 + payload_length`).
- **Buffer Keccak-256 Hash:** Asserts exact Keccak-256 digest of uploaded bytes matches the reviewer's artifact.
- **Deployment Slot Binding:** Asserts that `ProgramData.slot == S0` (the exact deployment slot at review time).

If an older proposal is executed after another release has already taken place, the deployment slot check fails atomically with Lighthouse error `0x1771` (`AssertionFailed` / `6001`), halting the upgrade and preserving the deployed program. An intentional rollback requires an explicit fresh proposal and renewed multi-member review.

## 3. What Was Demonstrated

The project delivered a full end-to-end implementation and verified it with on-chain cryptographic evidence on Solana Devnet:

1. **Pure Verification Core (`release-core`):** A zero-dependency protocol and policy engine implementing 28 canonical checks across identity, transaction, buffer, deployment, artifact, and provenance. Runs identically under Node.js and Hermes.
2. **Native Android Application (`apps/mobile`):** A React Native / Expo application built with the New Architecture, implementing direct Mobile Wallet Adapter sessions, release manifest parsing, dual-channel artifact import (file picker and native sharing), reviewer provenance attestation, 8-section proposal review, guarded proposal creation, vote authorization, execution controls, and deployment receipt generation.
3. **Live Two-Member Governance & Out-of-Order Failure Ceremony:** On devnet multisig `HfR4S98sUkf5VNkm64zQV8eAemmpMnS9DcCcWNz51uaR`, proposals for Release A and Release B were approved against slot $S_0=510053608$. Release B executed successfully at slot `510077654`. When execution of Release A was attempted, it failed on-chain with Lighthouse error `0x1771`, leaving the program at Release B. Rollback was subsequently demonstrated via an explicit counterpart proposal.
4. **Resilience & Fault Recovery:** Verified clean recovery under process death, network drops during submission, expired blockhashes, and superseded proposal creation, guaranteeing zero duplicate transactions.
5. **Production Release APK:** A standalone release APK signed with a production keystore, bundling both `arm64-v8a` and `x86_64` binaries, functioning completely independently of development servers.


## 4. Artifact Details

- **Application ID:** `com.releasegate.mobile`
- **Application Name:** ReleaseGate
- **Release APK SHA-256:** `8817477b1fe4e4f9d85b8602b3cfdc901cb0bbfecb6c47c44f93f10c077b3b09`
- **Location:** `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- **License:** Apache-2.0
