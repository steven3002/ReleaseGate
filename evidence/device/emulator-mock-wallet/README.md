# Device Evidence: Android Emulator & Mock MWA Wallet

> **Notice:** The screenshots and device interaction captures in this directory were produced on an Android emulator (`x86_64`, Android API 36) using **Mock MWA Wallet** (`com.solana.mwallet`). This is an automated reference testbed, **not a physical device** and **not a production wallet**. It serves to verify complete end-to-end Mobile Wallet Adapter (MWA) protocol compliance, UI presentation, and cryptographic verification on Android.

---

## Environment Details

- **Device Architecture:** Android Emulator (`x86_64`, Android 16 / API 36 userdebug)
- **Display Resolution:** 720 × 1280 (320 dpi)
- **Wallet Implementation:** Solana Mobile Mock MWA Wallet (`com.solana.mwallet`)
- **Cluster:** Solana Devnet (`EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`)
- **Multisig Fixture:** `HfR4S98sUkf5VNkm64zQV8eAemmpMnS9DcCcWNz51uaR`
- **Target Program:** `H46umyRgSUPAy3BNUanAriALsQw2KfL37uUJs9ZLfcgs`

---

## Screenshot Index

### Demonstration Ceremony (Scope S8)

| Filename | Description | Verified Attributes |
|---|---|---|
| `s8-01-workspace-home.png` | Workspace home view before ceremony | Multisig status, permissions (`Initiate`, `Vote`, `Execute`), proposals index |
| `s8-02-imported-releases-attested.png` | Local release repository in app | Both `release-demo v1` and `release-demo v2` imported, attested, and proven |
| `s8-03-proposal-a-preview.png` | Guarded Proposal A creation preview | Slot binding `510053608`, buffer length 3040, Keccak hash |
| `s8-04-wallet-prompt-proposal-a.png` | MWA signing sheet for Proposal A | Mock MWA Wallet transaction signing sheet for proposal creation |
| `s8-05-proposal-a-created-verified.png` | Confirmation dialog for Proposal A | Proposal #6 created successfully on-chain |
| `s8-06-proposal-b-preview.png` | Guarded Proposal B creation preview | Slot binding `510053608`, buffer length 3056, Keccak hash |
| `s8-07-wallet-prompt-proposal-b.png` | MWA signing sheet for Proposal B | Mock MWA Wallet transaction signing sheet for proposal creation |
| `s8-08-proposal-b-created-verified.png` | Confirmation dialog for Proposal B | Proposal #7 created successfully on-chain |
| `s8-09-workspace-home-proposals-6-7.png` | Workspace proposals list | Proposals #6 and #7 listed as `Active` (0 of 2 approvals) |
| `s8-10-proposal-a-review-top.png` | Proposal #6 review card | Verdict: "Matches reviewed artifact", "Execution conditions hold" |
| `s8-10-workspace-home-proposals-approved.png` | Workspace list after desktop approval | Proposals #6, #7, and #8 show `Approved` (2 of 2 approvals) |
| `s8-11-proposal-a-approved-mobile.png` | Approval confirmation dialog for A | Member 1 approval signature confirmed |
| `s8-11b-proposal-a-approved-by-you.png` | Proposal #6 review status | Shows "Approved by You" badge and 1 of 2 threshold progress |
| `s8-12-proposal-b-approved-mobile.png` | Approval confirmation dialog for B | Member 1 approval signature confirmed |
| `s8-12a-proposal-b-review-top.png` | Proposal #7 review card | Shows "Matches reviewed artifact", "Execution conditions hold" |
| `s8-13a-proposal-a-prime-review-top.png` | Proposal #8 (A′) review top card | Verdict: `Execution conditions incomplete` (amber badge) |
| `s8-13b-proposal-a-prime-approve-blocked.png` | Proposal #8 approve action blocked | Approve Upgrade button is blocked with explicit explanation |
| `s8-13c-proposal-a-prime-conditions-incomplete.png` | Proposal #8 conditions overview | Shows 3 of 4 checks passing; incomplete guard status |
| `s8-13c-proposal-a-prime-slot-missing.png` | Proposal #8 slot guard breakdown | Explicitly flags `4. Deployment Slot Binding: Missing` |
| `s8-14-executing-b.png` | Executing Proposal #7 | MWA transaction submission in progress |
| `s8-14-upgrade-executed-dialog.png` | Execution success alert | "Upgrade Executed: Proposal #7 has been executed on chain!" |
| `s8-15a-deployment-receipt-top.png` | Deployment receipt: Reconciliation | Status: `Reconciled`, Deployed Slot: `510077654` |
| `s8-15b-deployment-receipt-bottom.png` | Deployment receipt: Bytecode proof | Payload matches artifact, trailing zero padding valid, buffer closed |
| `s8-16a-proposal-a-conditions-no-longer-hold-verdict.png` | Proposal #6 review after B executes | Verdict badge: `Execution conditions no longer hold` (red badge) |
| `s8-16c-proposal-a-conditions-slot-mismatch.png` | Proposal #6 slot mismatch card | Expected: `510053608`, Current: `510077654` (`Slot Changed / Mismatch`) |
| `s8-16d-proposal-a-execute-blocked.png` | Proposal #6 instructions review | Shows assertions in instruction list |
| `s8-16e-proposal-a-bottom-actions.png` | Proposal #6 action eligibility | `Execute Upgrade` blocked: "Execution conditions status is not-holding" |
| `s8-standalone-launch.png` | Standalone release APK running on emulator | App running standalone with embedded JS bundle, without Metro dev server |

---

### UI & Review Verification (Scope S6 & S7)

| Filename | Description |
|---|---|
| `s6-01-guarded-matching-top.png` through `s6-03-guarded-matching-bottom.png` | Complete multi-section review of valid guarded upgrade |
| `s6-04-unguarded-top.png` & `s6-05-unguarded-bottom.png` | Review of unguarded upgrade highlighting missing assertions |
| `s6-06-unsupported-top.png` & `s6-07-unsupported-bottom.png` | Review of unsupported multisig transaction |
| `s6-08-release-picker.png` | Release candidate selection modal |
| `s6-09-no-release.png` & `s6-09-no-release-actions.png` | Review without artifact selected (action blocked) |
| `s6-10-wrong-artifact-top.png` to `s6-12-wrong-artifact-actions.png` | Review against mismatched artifact (bytecode hash mismatch) |
| `s7-01-proposal-3-reject-available.png` to `s7-04-proposal-3-rejected-by-you.png` | Voting flow: rejecting a malicious/unsupported proposal |
| `s7-05-proposal-2-replacement-available.png` to `s7-07-proposal-4-created-verified.png` | Unguarded replacement flow: creating guarded counterpart |
| `s7-08-workspace-home-proposals-4.png` to `s7-10-new-guarded-proposal-5-created-verified.png` | Creating new guarded proposal directly from app |
| `s7-11-proposal-1-approve-available.png` to `s7-16-deployment-receipt-details.png` | Approving, executing, and viewing receipt for proposal #1 |
| `s7-17-execution-refused-slot-mismatch.png` | Execution refusal when slot changed on-chain |
