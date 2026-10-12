# @steven3002/release-core

The shared library behind [ReleaseGate](https://github.com/steven3002/ReleaseGate): decoding, hashing, verification, policy and transaction construction for reviewing and authorizing Solana program upgrades through a Squads multisig.

It has no dependency on React Native and runs in Node.js 20 or later.

## Install

The package is published to GitHub Packages. Point the `@steven3002` scope at that registry, then install:

```bash
echo "@steven3002:registry=https://npm.pkg.github.com" >> .npmrc
npm install @steven3002/release-core
```

GitHub Packages requires an access token with `read:packages` for installs.

The package ships ESM and CommonJS builds. Its type declarations are written for TypeScript's `bundler` module resolution.

## What it provides

- **Digests:** literal SHA-256 and Keccak-256, and the verified-build SHA-256 that ignores trailing zero padding.
- **Manifests:** parsing and validation of release manifests, and binding an artifact to its manifest.
- **Inspection:** reading a Squads proposal and decoding its stored transaction, including loader-v3 upgrade and Lighthouse assertion instructions.
- **Verification and policy:** the 28 checks ReleaseGate runs on a proposal, and the verdict that decides which actions are allowed.
- **Guarded proposals:** construction of an upgrade bound to the program's deployment slot by Lighthouse assertions.
- **Settlement:** deciding an operation's outcome from chain state rather than from a wallet's answer.
- **Receipts:** reconciliation of a deployment against the reviewed artifact.

## Example

```ts
import { computeArtifactDigests, parseManifest } from '@steven3002/release-core';
import { readFile } from 'node:fs/promises';

const artifact = new Uint8Array(await readFile('program.so'));
const digests = computeArtifactDigests(artifact);

const manifest = parseManifest(new Uint8Array(await readFile('manifest.json')));
```

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
