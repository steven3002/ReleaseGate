# Physical Device Verification Records

This directory contains the records of physical Android smartphone validation using the signed release APK (`app-release.apk`) with a production mobile wallet (Phantom on Devnet).

## Hardware Setup & Run Sheet

The step-by-step procedure for installing the signed APK, connecting a real mobile wallet over Mobile Wallet Adapter (MWA), importing artifacts, and authorizing release proposals is documented in:
- [`RUN_SHEET.md`](RUN_SHEET.md)

## Status

- **Release APK:** `app-release.apk`, attached to the [v0.1.0 release](https://github.com/steven3002/ReleaseGate/releases/tag/v0.1.0). SHA-256: `6878d83725a04a44936f1ce0ba8fbc02d8af1d3397ce6aa0a07002df5ef0a393`. Signed with the release key (`CN=ReleaseGate`, APK Signature Scheme v2).
- **Device:** Samsung Galaxy S21 5G (`arm64-v8a`).
- **Wallet:** Phantom for Android, Testnet Mode, Solana Devnet.
- **Hardware Status:** Executed on 2026-10-12. Approval and execution were both signed in Phantom and confirmed on Devnet.

## Devnet Records

| Item | Value |
| --- | --- |
| Member wallet (Phantom) | `42U2D1EKFaw4XLy2W9uJexuo4NxG6A2nHD7qEP5fAD2d` |
| Multisig | `GeXHkKrpN1ZWmVXm1xAuv5Sn1ChNx9Q7gZV1Pn6RnVvU` |
| Target program | `CenMUMpxUG8A9tQyn2f2mDM4T3vDVhoABtGXEH6VdLs1` |
| Proposal approval (`ProposalApprove`) | `2Tki8Dw6yueSnGx8QMjizf8coPVDRcYwRYcTvJhD6y1ZiUwguzCaPpc8WVi5tYvu5XfBnw5UsFrkPpDihZqxzZ1v` (slot 510363392) |
| Guarded execution (`VaultTransactionExecute`) | `gsHr2xG4wava92rT2Pkc3bkbRqDbPhZjbUvvwQ8XhsWVUuFjyZmWwpeDiNHnRSyGBA8SH8xCmorRBNkco6kP8Wz` (slot 510366252) |

The execution transaction's log shows the three `AssertAccountInfo` checks and the `AssertUpgradeableLoaderAccount` slot check passing before the upgrade.

## Wallet Behaviour Observed

- Phantom presents a signing request only when the app identifies itself with an identity URI. With a name-only identity it shows its connect sheet and never the signing sheet.
- Phantom shows its connect sheet at the start of a signing flow even when a cached authorization is offered. The app closes that session, renews the transaction's blockhash, and opens a second session for the confirm sheet.
- On this device the app has no network access while the wallet holds the foreground, so the app performs no network calls during a wallet session and broadcasts after the session closes.
- Phantom adds two `ComputeBudget` instructions to the transaction it signs. The app accepts a signed transaction whose reviewed instructions are unchanged and whose only additions are compute budget or Lighthouse assertion instructions, and refuses any other change.

*Note: physical hardware records are stored in this directory (`evidence/device/physical/`) and kept distinct from emulator mock-wallet records in `evidence/device/emulator-mock-wallet/`.*
