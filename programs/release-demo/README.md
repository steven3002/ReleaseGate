# release-demo

A minimal upgradeable Solana program built with `pinocchio` designed for verifying program upgrades and deployment lifecycle assertions.

## Overview

The program maintains no persistent accounts and manages no state. Instead, it demonstrates deterministically distinct observable behaviours between Version 1 and Version 2 under simulated and executed calls:

- **Version 1 (`features = ["v1"]`)**:
  - Emits program log: `"Program release-demo version 1 running: linear transform"`
  - Computes linear byte summation: `sum = 101 + sum(bytes)`
  - Sets return data: 12-byte payload starting with ASCII `"V1:="` followed by 8-byte little-endian `sum`
  - Emits completion log: `"Program release-demo version 1 execution complete"`

- **Version 2 (`features = ["v2"]`)**:
  - Emits program log: `"Program release-demo version 2 running: quadratic transform"`
  - Computes polynomial byte accumulator: `acc = (acc * 31) + byte`, starting at 202
  - Sets return data: 12-byte payload starting with ASCII `"V2:="` followed by 8-byte little-endian `acc`
  - Emits completion log: `"Program release-demo version 2 execution complete"`

## Building

Building requires the Solana SBF toolchain (`cargo-build-sbf`).

### Version 1
```bash
cargo-build-sbf --manifest-path programs/release-demo/Cargo.toml --features v1 --no-default-features
```
The output binary is emitted to `programs/release-demo/target/deploy/release_demo.so`.

### Version 2
```bash
cargo-build-sbf --manifest-path programs/release-demo/Cargo.toml --features v2 --no-default-features
```
The output binary is emitted to `programs/release-demo/target/deploy/release_demo.so`.
