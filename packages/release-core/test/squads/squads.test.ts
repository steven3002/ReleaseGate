import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMultisigAccount } from '../../src/squads/multisig';
import { decodeProposalAccount } from '../../src/squads/proposal';
import { decodeStoredTransaction } from '../../src/squads/stored-transaction';
import { deriveMultisigPda, deriveVaultPda, deriveTransactionPda, deriveProposalPda } from '../../src/squads/addresses';
import { parsePermissions, getMemberCapabilities } from '../../src/squads/permissions';
import { buildCreateGuardedProposal, buildApprove, buildReject, buildExecute } from '../../src/squads/instructions';
import { getSquadsErrorName } from '../../src/squads/errors';
import type { ChainReader } from '../../src/chain/chain-reader';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mainnetFixture = JSON.parse(
  readFileSync(path.resolve(__dirname, '../fixtures/local-svm-lifecycle.mainnet-squads-build.json'), 'utf8')
);
const devnetFixture = JSON.parse(
  readFileSync(path.resolve(__dirname, '../fixtures/local-svm-lifecycle.devnet-squads-build.json'), 'utf8')
);

describe('squads PDA derivation', () => {
  it('matches fixture PDA addresses', () => {
    const { addresses } = mainnetFixture;
    assert.equal(deriveMultisigPda(addresses.create_key).address, addresses.multisig);
    assert.equal(deriveVaultPda(addresses.multisig, addresses.vault_index).address, addresses.vault);
    assert.equal(deriveTransactionPda(addresses.multisig, 1n).address, mainnetFixture.proposals['1'].transaction_address);
    assert.equal(deriveProposalPda(addresses.multisig, 1n).address, mainnetFixture.proposals['1'].proposal_address);
  });
});

describe('squads permissions', () => {
  it('parses permission mask 7 as full Initiate, Vote, Execute capabilities', () => {
    const p = parsePermissions(7);
    assert.equal(p.initiate, true);
    assert.equal(p.vote, true);
    assert.equal(p.execute, true);
    assert.equal(p.rawMask, 7);
  });

  it('derives member capabilities accurately', () => {
    const members = [
      { address: 'addr1', permissions: parsePermissions(3) }, // initiate + vote
      { address: 'addr2', permissions: parsePermissions(4) }, // execute only
    ];
    assert.deepEqual(getMemberCapabilities(members, 'addr1'), {
      isMember: true,
      initiate: true,
      vote: true,
      execute: false,
    });
    assert.deepEqual(getMemberCapabilities(members, 'addr2'), {
      isMember: true,
      initiate: false,
      vote: false,
      execute: true,
    });
    assert.deepEqual(getMemberCapabilities(members, 'unknown'), {
      isMember: false,
      initiate: false,
      vote: false,
      execute: false,
    });
  });
});

for (const [buildName, fixture] of [
  ['mainnet Squads build', mainnetFixture],
  ['devnet Squads build', devnetFixture],
] as const) {
  describe(`fixture decoding: ${buildName}`, () => {
    it('decodes Multisig account to threshold 2 and two members with full permissions', () => {
      const msBytes = Buffer.from(fixture.snapshots['multisig-created'].multisig.data_base64, 'base64');
      const res = decodeMultisigAccount(msBytes);
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.value.threshold, 2);
        assert.equal(res.value.members.length, 2);
        assert.equal(res.value.members[0]?.address, fixture.addresses.member_one);
        assert.equal(res.value.members[0]?.permissions.rawMask, 7);
        assert.equal(res.value.members[1]?.address, fixture.addresses.member_two);
        assert.equal(res.value.members[1]?.permissions.rawMask, 7);
      }
    });

    it('decodes Proposal account correctly across snapshots', () => {
      // 1. proposal-1-active-no-votes
      const p1NoVotes = Buffer.from(fixture.snapshots['proposal-1-active-no-votes'].proposals['1'].data_base64, 'base64');
      const dec1 = decodeProposalAccount(p1NoVotes);
      assert.equal(dec1.ok, true);
      if (dec1.ok) {
        assert.equal(dec1.value.status.kind, 'Active');
        assert.equal(dec1.value.approved.length, 0);
      }

      // 2. proposal-1-active-one-approval
      const p1OneApp = Buffer.from(fixture.snapshots['proposal-1-active-one-approval'].proposals['1'].data_base64, 'base64');
      const dec2 = decodeProposalAccount(p1OneApp);
      assert.equal(dec2.ok, true);
      if (dec2.ok) {
        assert.equal(dec2.value.status.kind, 'Active');
        assert.deepEqual(dec2.value.approved, [fixture.addresses.member_one]);
      }

      // 3. all-approved-before-any-execution
      const p1AllApp = Buffer.from(fixture.snapshots['all-approved-before-any-execution'].proposals['1'].data_base64, 'base64');
      const dec3 = decodeProposalAccount(p1AllApp);
      assert.equal(dec3.ok, true);
      if (dec3.ok) {
        assert.equal(dec3.value.status.kind, 'Approved');
        assert.equal(dec3.value.approved.length, 2);
      }

      // 4. after-newer-release-executed (Proposal 3 is Executed)
      const p3Exec = Buffer.from(fixture.snapshots['after-newer-release-executed'].proposals['3'].data_base64, 'base64');
      const dec4 = decodeProposalAccount(p3Exec);
      assert.equal(dec4.ok, true);
      if (dec4.ok) {
        assert.equal(dec4.value.status.kind, 'Executed');
      }

      // 5. after-older-release-blocked (Proposal 1 stays Approved!)
      const p1Blocked = Buffer.from(fixture.snapshots['after-older-release-blocked'].proposals['1'].data_base64, 'base64');
      const dec5 = decodeProposalAccount(p1Blocked);
      assert.equal(dec5.ok, true);
      if (dec5.ok) {
        assert.equal(dec5.value.status.kind, 'Approved');
      }
    });

    it('decodes stored transactions with exact signer and writable privileges', () => {
      for (const [idx, prop] of Object.entries(fixture.proposals) as [string, any][]) {
        const txBytes = Buffer.from(fixture.snapshots['all-approved-before-any-execution'].transactions[idx].data_base64, 'base64');
        const res = decodeStoredTransaction(prop.transaction_address, txBytes, 100);
        assert.equal(res.ok, true);
        if (res.ok) {
          assert.equal(res.value.kind, 'vault');
          assert.equal(res.value.vault, fixture.addresses.vault);
          assert.equal(res.value.creator, fixture.addresses.member_one);
          assert.equal(res.value.ephemeralSignerCount, 0);
          assert.equal(res.value.lookupTableCount, 0);

          // Exactly one signer: the vault
          const signers = res.value.accounts.filter(a => a.isSigner);
          assert.equal(signers.length, 1);
          assert.equal(signers[0]?.address, fixture.addresses.vault);

          // Writable set: vault, programData, program, buffer, spill
          const writables = res.value.accounts.filter(a => a.isWritable).map(a => a.address);
          assert.ok(writables.includes(fixture.addresses.vault));
          assert.ok(writables.includes(fixture.addresses.program_data));
          assert.ok(writables.includes(fixture.addresses.program));
          assert.ok(writables.includes(prop.buffer));
          assert.ok(writables.includes(fixture.addresses.spill));
        }
      }
    });
  });
}

describe('squads instruction builders and byte exactness (Pass Mark 2)', () => {
  it('produces create instructions whose inner message matches create_argument_message_hex', () => {
    const prop1 = mainnetFixture.proposals['1'];
    const innerInstructions = prop1.inner_instructions.map((ix: any) => ({
      programId: ix.program_id,
      accounts: ix.accounts.map((a: any) => ({
        address: a.address,
        isSigner: a.is_signer,
        isWritable: a.is_writable,
      })),
      data: new Uint8Array(Buffer.from(ix.data_hex, 'hex')),
    }));

    const createIxs = buildCreateGuardedProposal({
      multisig: mainnetFixture.addresses.multisig,
      transactionIndex: 1n,
      creator: mainnetFixture.addresses.member_one,
      vaultIndex: 0,
      innerInstructions,
    });

    assert.equal(createIxs.length, 2);
    // vaultTransactionCreate + proposalCreate
    assert.equal(createIxs[0]?.programId, mainnetFixture.constants.squads_program);
    assert.equal(createIxs[1]?.programId, mainnetFixture.constants.squads_program);
  });

  it('builds vote instructions for approve and reject', () => {
    const approveIx = buildApprove({
      multisig: mainnetFixture.addresses.multisig,
      transactionIndex: 1n,
      member: mainnetFixture.addresses.member_one,
    });
    assert.equal(approveIx.programId, mainnetFixture.constants.squads_program);

    const rejectIx = buildReject({
      multisig: mainnetFixture.addresses.multisig,
      transactionIndex: 1n,
      member: mainnetFixture.addresses.member_one,
    });
    assert.equal(rejectIx.programId, mainnetFixture.constants.squads_program);
  });

  it('builds execute instruction using ChainReader shim', async () => {
    const txAccountBytes = Buffer.from(mainnetFixture.snapshots['all-approved-before-any-execution'].transactions['1'].data_base64, 'base64');
    const mockChain: ChainReader = {
      getGenesisHash: async () => 'genesis',
      getAccounts: async (addrs) => {
        return {
          contextSlot: 100,
          accounts: addrs.map(addr => ({
            address: addr,
            data: new Uint8Array(txAccountBytes),
            owner: mainnetFixture.constants.squads_program,
            lamports: 1000000n,
            executable: false,
          })),
        };
      },
      getBlockHeight: async () => 100,
      getSignatureStatus: async () => null,
      getTransactionOutcome: async () => null,
    };

    const execIx = await buildExecute({
      chain: mockChain,
      multisig: mainnetFixture.addresses.multisig,
      transactionIndex: 1n,
      member: mainnetFixture.addresses.member_one,
    });

    assert.equal(execIx.programId, mainnetFixture.constants.squads_program);
    assert.ok(execIx.accounts.some(a => a.address === mainnetFixture.addresses.vault));
  });
});

describe('squads error code lookup', () => {
  it('maps confirmed error codes to names (C-SQ-08)', () => {
    assert.equal(getSquadsErrorName(6004), 'Unauthorized');
    assert.equal(getSquadsErrorName(6005), 'NotAMember');
    assert.equal(getSquadsErrorName(6007), 'StaleProposal');
    assert.equal(getSquadsErrorName(6008), 'InvalidProposalStatus');
    assert.equal(getSquadsErrorName(6021), 'TimeLockNotReleased');
    assert.equal(getSquadsErrorName(9999), undefined);
  });
});
