# Local Validation and Reference Probes

This directory contains executable validation harnesses, reference probes, and local SVM test fixtures for ReleaseGate. These tools demonstrate execution guard semantics, upgrade handling under Loader-v3, and full Squads v4 multisig transaction construction in an isolated, deterministic environment.

## Overview

- `fetch_evidence.py`: Fetches deployed Lighthouse program bytecode from public RPC.
- `fetch_squads.py`: Fetches canonical Squads v4 program and configuration snapshots from public RPC.
- `verify_snapshots.py`: Verifies that fetched program bytecode matches expected SHA-256 digests.
- `svm_server.py`: Local LiteSVM bridge exposing a line-delimited JSON interface for transaction execution.
- `guard_probe.py`: Tests Lighthouse assertions (buffer owner, complete data length, and Keccak-256 hash) against synthetic accounts.
- `upgrade_probe.py`: Tests Loader-v3 `Upgrade` execution combined with Lighthouse deployment slot checks.
- `squads_probe.mjs`: Tests full 2-of-2 Squads multisig proposal creation, approvals, and execution lifecycle.
- `capture_fixtures.mjs`: Replays the deterministic 2-of-2 Squads lifecycle against LiteSVM to generate test fixtures for unit tests.

## Prerequisites

- Node.js >= 20.x
- Python 3.12.x
- Public network access for initial bytecode fetch via RPC

## Reproduction Steps

From this directory (`evidence/local-validation/`):

1. **Set up Python virtual environment and dependencies:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   python -m pip install -r requirements.txt
   ```

2. **Fetch and verify on-chain program bytecode:**
   ```bash
   python fetch_evidence.py
   python fetch_squads.py
   python verify_snapshots.py
   ```
   *Note: For testing against the devnet Squads build, adjust the RPC endpoint in `fetch_squads.py` to `https://api.devnet.solana.com`.*

3. **Install Node dependencies:**
   ```bash
   npm ci --ignore-scripts
   ```

4. **Execute validation probes:**
   ```bash
   python guard_probe.py
   python upgrade_probe.py
   node squads_probe.mjs
   ```

5. **Generate test fixtures:**
   ```bash
   node capture_fixtures.mjs ../../packages/release-core/test/fixtures/local-svm-lifecycle.mainnet-squads-build.json
   ```

## Expected Behavior and Invariants

- **Full buffer binding**: Assertion tests confirm that full-length Keccak-256 binding rejects trailing or altered bytes. A prefix-only guard fails to bind the complete payload.
- **Deployment slot gating**: An upgrade proposal conditioned on an initial deployment slot reverts when executed against a program whose slot has advanced, preventing rollback or collision.
- **Squads proposal state**: Blocked execution leaves the proposal in `Approved` state; executing an unconditioned upgrade succeeds subsequently.
