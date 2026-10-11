import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import devnetFixture from '../fixtures/local-svm-lifecycle.devnet-squads-build.json' with { type: 'json' };
import mainnetFixture from '../fixtures/local-svm-lifecycle.mainnet-squads-build.json' with { type: 'json' };
import { decodeStoredTransaction } from '../../src/squads/stored-transaction';
import { assessStoredTransaction } from '../../src/guard/assess';
import { SYSVAR_RENT_ID } from '../../src/cluster/programs';
import type { StoredTransaction } from '../../src/squads/stored-transaction';

describe('guard assessment and shapes (Pass Mark 5)', () => {
  for (const [name, fixture] of [
    ['devnet build', devnetFixture],
    ['mainnet build', mainnetFixture],
  ] as const) {
    it(`assesses proposals 1 and 3 as guarded-upgrade in ${name}`, () => {
      for (const idx of ['1', '3'] as const) {
        const txBytes = Buffer.from(
          fixture.snapshots['all-approved-before-any-execution'].transactions[idx].data_base64,
          'base64',
        );
        const dec = decodeStoredTransaction(fixture.proposals[idx].transaction_address, txBytes, 100);
        assert.equal(dec.ok, true);
        if (!dec.ok) return;

        const assessment = assessStoredTransaction(dec.value);
        assert.equal(assessment.shape, 'guarded-upgrade');
        assert.deepEqual(assessment.findings, []);
        assert.ok(assessment.params);
        assert.equal(assessment.params.program, fixture.addresses.program);
        assert.equal(assessment.params.programData, fixture.addresses.program_data);
        assert.equal(assessment.params.buffer, fixture.proposals[idx].buffer);
        assert.equal(assessment.params.spill, fixture.addresses.spill);
        assert.equal(assessment.params.vault, fixture.addresses.vault);
        assert.equal(assessment.params.payloadLength, BigInt(fixture.artifact.length));
        assert.equal(assessment.params.keccak256, fixture.artifact.keccak256);
        assert.equal(assessment.params.deploymentSlot, BigInt(fixture.slots.initial_deployment_slot));
      }
    });

    it(`assesses proposal 2 as partial-guard in ${name}`, () => {
      const txBytes = Buffer.from(
        fixture.snapshots['all-approved-before-any-execution'].transactions['2'].data_base64,
        'base64',
      );
      const dec = decodeStoredTransaction(fixture.proposals['2'].transaction_address, txBytes, 100);
      assert.equal(dec.ok, true);
      if (!dec.ok) return;

      const assessment = assessStoredTransaction(dec.value);
      assert.equal(assessment.shape, 'partial-guard');
      assert.deepEqual(assessment.findings, ['Missing deployment slot assertion']);
      assert.ok(assessment.params);
      assert.equal(assessment.params.program, fixture.addresses.program);
      assert.equal(assessment.params.buffer, fixture.proposals['2'].buffer);
      assert.equal(assessment.params.payloadLength, BigInt(fixture.artifact.length));
      assert.equal(assessment.params.keccak256, fixture.artifact.keccak256);
      assert.equal(assessment.params.deploymentSlot, undefined);
    });
  }

  function getBaseCanonicalTx(): StoredTransaction {
    const fixture = devnetFixture;
    const txBytes = Buffer.from(
      fixture.snapshots['all-approved-before-any-execution'].transactions['1'].data_base64,
      'base64',
    );
    const dec = decodeStoredTransaction(fixture.proposals['1'].transaction_address, txBytes, 100);
    if (!dec.ok) throw new Error(dec.reason);
    return dec.value;
  }

  it('assesses lone Upgrade as unguarded-upgrade', () => {
    const base = getBaseCanonicalTx();
    const upgradeIx = base.instructions[4];
    assert.ok(upgradeIx);

    // Filter accounts to only those referenced in lone upgrade
    const upgradeAccountAddresses = new Set([
      ...upgradeIx.accounts.map((a) => a.address),
      upgradeIx.programId,
    ]);
    const tx: StoredTransaction = {
      ...base,
      instructions: [upgradeIx],
      accounts: base.accounts.filter((a) => upgradeAccountAddresses.has(a.address)),
    };

    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unguarded-upgrade');
    assert.ok(assessment.params);
    assert.equal(assessment.params.program, devnetFixture.addresses.program);
    assert.equal(assessment.params.vault, devnetFixture.addresses.vault);
    assert.deepEqual(assessment.findings, ['Transaction contains Upgrade without guard assertions']);
  });

  it('rejects reordered instructions as unsupported', () => {
    const base = getBaseCanonicalTx();
    // Swap buffer-length (idx 1) and buffer-owner (idx 0)
    const reorderedInstructions = [
      base.instructions[1]!,
      base.instructions[0]!,
      base.instructions[2]!,
      base.instructions[3]!,
      base.instructions[4]!,
    ];
    const tx: StoredTransaction = { ...base, instructions: reorderedInstructions };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
    assert.ok(assessment.findings.some((f) => f.includes('order')));
  });

  it('rejects different operator as unsupported', () => {
    const base = getBaseCanonicalTx();
    // Tamper operator byte in instruction 0 (AssertAccountInfo Owner) from Equal (0x00) to NotEqual (0x01)
    const tamperedData = new Uint8Array(base.instructions[0]!.data);
    tamperedData[tamperedData.length - 1] = 1;
    const tx: StoredTransaction = {
      ...base,
      instructions: [
        { ...base.instructions[0]!, data: tamperedData },
        base.instructions[1]!,
        base.instructions[2]!,
        base.instructions[3]!,
        base.instructions[4]!,
      ],
    };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
  });

  it('rejects different hash start offset as unsupported', () => {
    const base = getBaseCanonicalTx();
    // Instruction 2 is VerifyDatahash: header (3) + 32-byte hash + LEB128(start) + LEB128(length)
    // Tamper LEB128(start) from 37 to 0
    const tamperedData = new Uint8Array(base.instructions[2]!.data);
    // At index 35 is start offset LEB128
    tamperedData[35] = 0;
    const tx: StoredTransaction = {
      ...base,
      instructions: [
        base.instructions[0]!,
        base.instructions[1]!,
        { ...base.instructions[2]!, data: tamperedData },
        base.instructions[3]!,
        base.instructions[4]!,
      ],
    };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
    assert.ok(assessment.findings.some((f) => f.includes('start must be 37')));
  });

  it('rejects extra instruction as unsupported', () => {
    const base = getBaseCanonicalTx();
    const extraIx = base.instructions[0]!;
    const tx: StoredTransaction = {
      ...base,
      instructions: [...base.instructions, extraIx],
    };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
  });

  it('rejects extra writable account as unsupported', () => {
    const base = getBaseCanonicalTx();
    // Make rent sysvar writable in tx.accounts
    const tx: StoredTransaction = {
      ...base,
      accounts: base.accounts.map((a) =>
        a.address === SYSVAR_RENT_ID ? { ...a, isWritable: true } : a,
      ),
    };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
    assert.ok(assessment.findings.some((f) => f.includes('Writable accounts do not match')));
  });

  it('rejects unused account key as unsupported', () => {
    const base = getBaseCanonicalTx();
    const unusedKey = '11111111111111111111111111111112';
    const tx: StoredTransaction = {
      ...base,
      accounts: [...base.accounts, { address: unusedKey, isSigner: false, isWritable: false }],
    };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
    assert.ok(assessment.findings.some((f) => f.includes('Unused account key')));
  });

  it('rejects lookup table presence as unsupported', () => {
    const base = getBaseCanonicalTx();
    const tx: StoredTransaction = { ...base, lookupTableCount: 1 };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
    assert.ok(assessment.findings.some((f) => f.includes('lookup table')));
  });

  it('rejects ephemeral signer presence as unsupported', () => {
    const base = getBaseCanonicalTx();
    const tx: StoredTransaction = { ...base, ephemeralSignerCount: 1 };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
    assert.ok(assessment.findings.some((f) => f.includes('Ephemeral signer')));
  });

  it('rejects buffer assertion aimed at another account as unsupported', () => {
    const base = getBaseCanonicalTx();
    const otherAccount = '11111111111111111111111111111112';
    const tx: StoredTransaction = {
      ...base,
      accounts: [...base.accounts, { address: otherAccount, isSigner: false, isWritable: false }],
      instructions: [
        {
          ...base.instructions[0]!,
          accounts: [{ address: otherAccount, isSigner: false, isWritable: false }],
        },
        base.instructions[1]!,
        base.instructions[2]!,
        base.instructions[3]!,
        base.instructions[4]!,
      ],
    };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
    assert.ok(assessment.findings.some((f) => f.includes('targets')));
  });

  it('rejects second signer as unsupported', () => {
    const base = getBaseCanonicalTx();
    // Mark spill account as signer
    const tx: StoredTransaction = {
      ...base,
      accounts: base.accounts.map((a) =>
        a.address === devnetFixture.addresses.spill ? { ...a, isSigner: true } : a,
      ),
    };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
    assert.ok(assessment.findings.some((f) => f.includes('exactly one signer')));
  });

  it('rejects non-vault transaction kind as unsupported', () => {
    const base = getBaseCanonicalTx();
    const tx: StoredTransaction = { ...base, kind: 'config' };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
    assert.ok(assessment.findings.some((f) => f.includes('not a Squads vault transaction')));
  });

  it('rejects programData address mismatch as unsupported', () => {
    const base = getBaseCanonicalTx();
    // Tamper programData address in accounts and instructions
    const fakeProgramData = '11111111111111111111111111111112';
    const tx: StoredTransaction = {
      ...base,
      accounts: base.accounts.map((a) =>
        a.address === devnetFixture.addresses.program_data ? { ...a, address: fakeProgramData } : a,
      ),
      instructions: base.instructions.map((ix) => ({
        ...ix,
        accounts: ix.accounts.map((a) =>
          a.address === devnetFixture.addresses.program_data ? { ...a, address: fakeProgramData } : a,
        ),
      })),
    };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
    assert.ok(assessment.findings.some((f) => f.includes('ProgramData address')));
  });

  it('rejects spill account overlapping with program, buffer, or programData', () => {
    const base = getBaseCanonicalTx();
    // Set spill to program address
    const tx: StoredTransaction = {
      ...base,
      instructions: base.instructions.map((ix, idx) => {
        if (idx !== 4) return ix;
        return {
          ...ix,
          accounts: ix.accounts.map((a, aIdx) =>
            aIdx === 3 ? { ...a, address: devnetFixture.addresses.program } : a,
          ),
        };
      }),
    };
    const assessment = assessStoredTransaction(tx);
    assert.equal(assessment.shape, 'unsupported');
    assert.ok(assessment.findings.some((f) => f.includes('Spill account cannot be')));
  });
});
