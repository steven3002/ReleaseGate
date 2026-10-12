# ReleaseGate — Physical Device Run Sheet

This guide provides step-by-step instructions for running and validating the signed ReleaseGate APK on physical Android hardware with a production Solana wallet (e.g., Phantom on Devnet).

---

## 1. Prerequisites & Equipment

- **Device:** Android physical smartphone (`arm64-v8a`, Android 10+ / API 29+; e.g. Samsung Galaxy S21 5G).
- **Wallet App:** Production mobile wallet supporting Mobile Wallet Adapter (MWA) and Solana Devnet (e.g. Phantom for Android).
- **Network:** Connected to internet with access to Solana Devnet RPC (`https://api.devnet.solana.com`).
- **Release APK:** `app-release.apk` from the [v0.1.0 release](https://github.com/steven3002/ReleaseGate/releases/tag/v0.1.0) (SHA-256: `6878d83725a04a44936f1ce0ba8fbc02d8af1d3397ce6aa0a07002df5ef0a393`), or built locally at `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

---

## 2. Step 1: Install the Signed APK

### Option A: Via USB / ADB
With your phone connected to your workstation with USB debugging enabled:
```bash
adb install -r app-release.apk
```

### Option B: Direct Download / Local Transfer
1. Copy `app-release.apk` to your phone via Google Drive, local transfer, or web server.
2. Open the file on your device (e.g. via Google Files or Files by Samsung).
3. Confirm "Install from unknown sources" if prompted, and complete installation.

---

## 3. Step 2: Configure Your Wallet for Devnet

1. Open your wallet app (e.g. **Phantom**).
2. Go to **Settings** > **Developer Settings** (or **Network**).
3. Switch active cluster to **Solana Devnet**.
4. Copy your wallet's public address (e.g. `YourWalletAddress...`).
5. Ensure your wallet has a small devnet SOL balance (0.1–0.5 SOL) for fee payment (use `solana airdrop 1 <address> --url devnet` or faucet).

---

## 4. Step 3: Transfer Release Artifacts to the Phone

The app needs a reviewed binary and release manifest. Two easy methods to place them on your phone:

### Method 1: ADB Push to Downloads folder
```bash
adb push "programs/release-demo/target/deploy/release_demo_v2.so" /sdcard/Download/
adb push "evidence/devnet/ceremony/manifest-release-b-v2.json" /sdcard/Download/
```

### Method 2: Android Native Sharing or Drive
1. Email or message `release_demo_v2.so` and `manifest-release-b-v2.json` to yourself, or upload to Google Drive.
2. Save both files into your phone's local `Download` folder.
3. Alternatively, share directly into ReleaseGate: the app handles Android `ACTION_SEND` and `ACTION_VIEW` intents!

---

## 5. Step 4: Workspace Setup in ReleaseGate

1. Open **ReleaseGate** on your phone.
2. On the welcome screen, tap **Setup Workspace**.
3. **Target Cluster:** Select `devnet`.
4. **RPC Endpoint:** Keep default `https://api.devnet.solana.com`.
5. **Reviewer Wallet:**
   - Tap **Connect Wallet (MWA)**.
   - Phantom will open with a connection request for "ReleaseGate".
   - Tap **Connect** to authorize.
   - You will return to ReleaseGate showing your connected public address (`42U2D1EKFaw4XLy2W9uJexuo4NxG6A2nHD7qEP5fAD2d`).
6. **Squads Multisig Address:**
   - Enter your dedicated staged multisig address:
     `GeXHkKrpN1ZWmVXm1xAuv5Sn1ChNx9Q7gZV1Pn6RnVvU`
   - (Vault: `9MF3gGv9eWPW2Dg3Mxn9zLRB6Q21VYrP25te7UAB4ETa`, Threshold: 2 of 2).
7. Tap **Save and Open Workspace**.

---

## 6. Step 5: Import Release & Attest Provenance

1. On the Workspace Home screen, navigate to **Imported Releases** (or tap **Import Release**).
2. Tap **Select Program Binary (.so)** and choose `release_demo_v2.so` (available at `evidence/device/physical/release_demo_v2.so`).
3. Tap **Select Manifest (.json)** and choose `manifest-release-b-v2.json` (available at `evidence/device/physical/manifest-release-b-v2.json`).
4. The app verifies that the binary length (3,056 bytes), SHA-256 (`fbf510...`), and Keccak-256 match the manifest definitions.
5. In the Reviewer Attestation sheet, review the binding declaration:
   > *"I obtained this artifact from my own review or build, not from the proposer."*
6. Tap **Confirm Attestation**. The release is saved to your device's secure store.

---

## 7. Step 6: Review & Authorize Proposal

1. From Workspace Home, tap on **Proposal 2** (Release B: Guarded upgrade to v2, initial slot `510297318`).
2. The **Proposal Review Screen** displays all 8 sections:
   - Target program (`CenMUMpxUG8A9tQyn2f2mDM4T3vDVhoABtGXEH6VdLs1`), Multisig, ProgramData, and Devnet.
   - Reviewed Artifact & Digests (SHA-256, Keccak-256, Verified-Build SHA-256).
   - Uploaded-Byte Comparison (asserting 0 delta and matching bytes).
   - Deployment Slot Binding (manifest vs guard vs on-chain slot: `510297318`).
   - Decoded instructions and affected accounts (5 inner instructions).
   - 28 canonical verification checks (all passing).
   - Governance status and connected wallet permissions (Member 1 of 2).
3. Review the top verdict banner:
   - Displays: **"Matches reviewed artifact"** (green) and **"Execution conditions verified"** (blue).
4. In Section 8 (Action Eligibility), tap **Approve Proposal**.
5. Phantom opens. If it shows its connect sheet first, tap **Connect**; Phantom closes and reopens with the **Confirm transaction** sheet.
6. Verify and confirm the approval in Phantom. A transaction is valid for about a minute, so confirm without leaving the sheet open.
7. Return to ReleaseGate: approval count updates to show `1 of 2` approvals registered on Devnet.
8. Request Member 2 approval: The desktop CLI will approve Proposal 2 on command, advancing the proposal to `Approved` (2 of 2).

---

## 8. Step 7: Execution & Deployment Receipt

1. With Proposal 2 at `Approved` (2 of 2) and your key having `Execute` permission, tap **Execute Upgrade**.
2. Confirm the execution transaction in Phantom.
3. Once confirmed on Devnet, ReleaseGate navigates to the **Deployment Receipt** screen.
4. Verify the 5 post-execution invariants:
   - Program deployment slot advanced to execution slot.
   - ProgramData upgrade authority is the multisig vault.
   - Byte-exact artifact match confirmed on-chain.
   - Zero trailing padding verified.
   - Temporary buffer account closed.

---

## 9. Step 8: Observe Blocked Release (Proposal 1)

1. Return to the proposal list and tap on **Proposal 1** (Release A: Guarded upgrade to v1).
2. The review screen updates against current on-chain state:
   - Top verdict card displays: **"Execution conditions no longer hold"** (red badge).
   - Section 4 highlights slot mismatch (new execution slot vs initial review slot `510297318`).
   - Section 8 disables **Execute Upgrade** with reason: *"Execution conditions status is not-holding, must be verified"*.
3. Capture this screen as conclusive proof that out-of-order execution is prevented on-chain!

---

## 10. Step 9: What to Record & Report

Please record and report the following information for the hardware verification archive:

1. **Device Information:**
   - Phone Model (e.g., Samsung Galaxy S21 5G / SM-G991U)
   - Android Version (e.g., Android 14, One UI 6.0)
2. **Wallet Information:**
   - Wallet App Name and Version (e.g., Phantom v24.10.0)
   - Connected Public Key on Devnet
3. **Ceremony Outputs:**
   - Proposal Reviewed / Executed
   - Transaction Signature(s) returned by the app
   - Resulting Receipt ID
4. **Visual Evidence:**
   - Screenshots of Proposal Review Screen (verdict cards), Wallet approval prompt, and Deployment Receipt Screen.
