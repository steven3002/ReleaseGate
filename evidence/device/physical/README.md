# Physical Device Verification Records

This directory contains records, logs, and screenshots from physical Android smartphone validation using the signed release APK (`app-release.apk`) with production mobile wallets (e.g., Phantom on Devnet).

## Hardware Setup & Run Sheet

The step-by-step procedure for installing the signed APK, connecting a real mobile wallet over Mobile Wallet Adapter (MWA), importing artifacts, and authorizing release proposals is documented in:
- [`RUN_SHEET.md`](file:///home/azureuser/Proceed%20with%20ReleaseGate/evidence/device/physical/RUN_SHEET.md)

## Status

- **Release APK:** Verified and signed (`apps/mobile/android/app/build/outputs/apk/release/app-release.apk`, SHA-256: `8817477b1fe4e4f9d85b8602b3cfdc901cb0bbfecb6c47c44f93f10c077b3b09`).
- **Target Device Profile:** Samsung Galaxy S21 5G (`arm64-v8a`), Android 14.
- **Target Wallet:** Phantom wallet on Android with Solana Devnet enabled.
- **Hardware Status:** Pending user test execution and log return.

*Note: Per strict project standards, physical hardware records are stored strictly in this directory (`evidence/device/physical/`) and kept completely distinct from headless emulator mock-wallet records in `evidence/device/emulator-mock-wallet/`.*
