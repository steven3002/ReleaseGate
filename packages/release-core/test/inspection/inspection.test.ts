import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import devnetFixture from '../fixtures/local-svm-lifecycle.devnet-squads-build.json' with { type: 'json' };
import type { ChainReader, AccountSnapshot } from '../../src/chain/chain-reader';
import { classifyInstruction } from '../../src/inspection/classify';
import { readProposal } from '../../src/inspection/read-proposal';
import { encodeLighthouseAssertion } from '../../src/lighthouse/encode';
import { encodeUpgradeInstruction } from '../../src/loader-v3/upgrade-instruction';
import {
  LOADER_V3_PROGRAM_ID,
  SQUADS_PROGRAM_ID,
  SYSVAR_CLOCK_ID,
  SYSVAR_RENT_ID,
} from '../../src/cluster/programs';
import { PublicKey } from '@solana/web3.js';
import {
  BUFFER_HEADER_SIZE,
  LOADER_STATE_BUFFER,
  LOADER_STATE_PROGRAM,
  LOADER_STATE_PROGRAM_DATA,
  PROGRAMDATA_HEADER_SIZE,
  PROGRAM_HEADER_SIZE,
} from '../../src/loader-v3/layout';

describe('instruction classification', () => {
  const targetBuffer = 'J7KoxDEA5v3z7ARXhBUtWj4ZqRQ7LjDNy9J8PGf29XwB';
  const targetProgramData = 'CwvqZPbNrPEizu66jGhLEmB77mNqJvfYGs3ziCrqrVGi';
  const sampleHash = '7493f7a2076e37b976b7034dfd682dd4ad2952d38135c51a0b695f603353c9e0';

  it('classifies canonical buffer owner assertion', () => {
    const ix = encodeLighthouseAssertion({
      kind: 'buffer-owner',
      target: targetBuffer,
      owner: LOADER_V3_PROGRAM_ID,
    });
    const classified = classifyInstruction(ix);
    assert.equal(classified.kind, 'assert-buffer-owner');
    if (classified.kind === 'assert-buffer-owner') {
      assert.equal(classified.target, targetBuffer);
      assert.equal(classified.owner, LOADER_V3_PROGRAM_ID);
    }
  });

  it('classifies canonical buffer length assertion', () => {
    const ix = encodeLighthouseAssertion({
      kind: 'buffer-length',
      target: targetBuffer,
      length: 424285n,
    });
    const classified = classifyInstruction(ix);
    assert.equal(classified.kind, 'assert-buffer-length');
    if (classified.kind === 'assert-buffer-length') {
      assert.equal(classified.target, targetBuffer);
      assert.equal(classified.length, 424285n);
    }
  });

  it('classifies canonical buffer hash assertion', () => {
    const ix = encodeLighthouseAssertion({
      kind: 'buffer-hash',
      target: targetBuffer,
      keccak256: sampleHash,
      start: 37n,
      length: 424248n,
    });
    const classified = classifyInstruction(ix);
    assert.equal(classified.kind, 'assert-buffer-hash');
    if (classified.kind === 'assert-buffer-hash') {
      assert.equal(classified.target, targetBuffer);
      assert.equal(classified.keccak256, sampleHash);
      assert.equal(classified.start, 37n);
      assert.equal(classified.length, 424248n);
    }
  });

  it('classifies canonical deployment slot assertion', () => {
    const ix = encodeLighthouseAssertion({
      kind: 'program-data-slot',
      target: targetProgramData,
      slot: 100n,
    });
    const classified = classifyInstruction(ix);
    assert.equal(classified.kind, 'assert-deployment-slot');
    if (classified.kind === 'assert-deployment-slot') {
      assert.equal(classified.target, targetProgramData);
      assert.equal(classified.slot, 100n);
    }
  });

  it('classifies canonical loader upgrade instruction', () => {
    const ix = encodeUpgradeInstruction({
      programData: targetProgramData,
      program: 'CxKhVB8eyBawrEmaqBkRmcVN47RJya1SSpxYiygR9tpJ',
      buffer: targetBuffer,
      spill: 'FPXkuSiG8EBc3Rrd9W1HfKsxVYZP8VErjpg36mx63z7F',
      rentSysvar: SYSVAR_RENT_ID,
      clockSysvar: SYSVAR_CLOCK_ID,
      authority: 'G8jZGsyWv1dGJP89ujJteoDpQCuh5yAN3pn6DqiJGbcB',
    });
    const classified = classifyInstruction(ix);
    assert.equal(classified.kind, 'loader-upgrade');
    if (classified.kind === 'loader-upgrade') {
      assert.equal(classified.programData, targetProgramData);
      assert.equal(classified.program, 'CxKhVB8eyBawrEmaqBkRmcVN47RJya1SSpxYiygR9tpJ');
      assert.equal(classified.buffer, targetBuffer);
    }
  });

  it('classifies unrecognized program ID as unsupported', () => {
    const classified = classifyInstruction({
      programId: '11111111111111111111111111111111',
      accounts: [],
      data: new Uint8Array([1, 2, 3]),
    });
    assert.equal(classified.kind, 'unsupported');
    if (classified.kind === 'unsupported') {
      assert.equal(classified.dataHex, '010203');
    }
  });
});

describe('readProposal flow', () => {
  const fixture = devnetFixture;
  const snapshot = fixture.snapshots['all-approved-before-any-execution'];

  function createMockChainReader(options?: {
    missingBuffer?: boolean;
    firstSlot?: number;
    secondSlot?: number;
  }): { reader: ChainReader; calls: { addresses: string[]; options?: { minContextSlot?: number | undefined } | undefined }[] } {
    const firstSlot = options?.firstSlot ?? 100;
    const secondSlot = options?.secondSlot ?? 105;
    const calls: { addresses: string[]; options?: { minContextSlot?: number | undefined } | undefined }[] = [];

    const multisigData = Buffer.from(snapshot.multisig.data_base64, 'base64');
    const proposalData = Buffer.from(snapshot.proposals['1'].data_base64, 'base64');
    const txData = Buffer.from(snapshot.transactions['1'].data_base64, 'base64');

    const dummyPayload = new Uint8Array([1, 2, 3, 4]);

    const programBytes = new Uint8Array(PROGRAM_HEADER_SIZE);
    new DataView(programBytes.buffer).setUint32(0, LOADER_STATE_PROGRAM, true);
    programBytes.set(new PublicKey(fixture.addresses.program_data).toBytes(), 4);

    const programDataBytes = new Uint8Array(PROGRAMDATA_HEADER_SIZE + dummyPayload.length);
    const pdView = new DataView(programDataBytes.buffer);
    pdView.setUint32(0, LOADER_STATE_PROGRAM_DATA, true);
    pdView.setBigUint64(4, 0n, true);
    programDataBytes[12] = 1;
    programDataBytes.set(new PublicKey(fixture.addresses.vault).toBytes(), 13);
    programDataBytes.set(dummyPayload, PROGRAMDATA_HEADER_SIZE);

    const bufferBytes = new Uint8Array(BUFFER_HEADER_SIZE + dummyPayload.length);
    new DataView(bufferBytes.buffer).setUint32(0, LOADER_STATE_BUFFER, true);
    bufferBytes[4] = 1;
    bufferBytes.set(new PublicKey(fixture.addresses.vault).toBytes(), 5);
    bufferBytes.set(dummyPayload, BUFFER_HEADER_SIZE);

    const accountStore = new Map<string, AccountSnapshot>([
      [fixture.addresses.multisig, { address: fixture.addresses.multisig, data: multisigData, executable: false, lamports: 1000000n, owner: SQUADS_PROGRAM_ID }],
      [fixture.proposals['1'].proposal_address, { address: fixture.proposals['1'].proposal_address, data: proposalData, executable: false, lamports: 1000000n, owner: SQUADS_PROGRAM_ID }],
      [fixture.proposals['1'].transaction_address, { address: fixture.proposals['1'].transaction_address, data: txData, executable: false, lamports: 1000000n, owner: SQUADS_PROGRAM_ID }],
      [fixture.addresses.program, { address: fixture.addresses.program, data: programBytes, executable: true, lamports: 1000000n, owner: LOADER_V3_PROGRAM_ID }],
      [fixture.addresses.program_data, { address: fixture.addresses.program_data, data: programDataBytes, executable: false, lamports: 1000000n, owner: LOADER_V3_PROGRAM_ID }],
      [fixture.proposals['1'].buffer, { address: fixture.proposals['1'].buffer, data: bufferBytes, executable: false, lamports: 1000000n, owner: LOADER_V3_PROGRAM_ID }],
    ]);

    if (options?.missingBuffer) {
      accountStore.delete(fixture.proposals['1'].buffer);
    }

    const reader: ChainReader = {
      getGenesisHash: async () => 'genesis-hash',
      getBlockHeight: async () => 1000,
      getSignatureStatus: async () => null,
      getTransactionOutcome: async () => null,
      getAccounts: async (addresses, opt) => {
        calls.push({ addresses, options: opt });
        const slot = opt?.minContextSlot !== undefined ? secondSlot : firstSlot;
        const accounts = addresses.map((addr) => accountStore.get(addr) ?? null);
        return { contextSlot: slot, accounts };
      },
    };

    return { reader, calls };
  }

  it('executes two coordinated reads with context slot binding', async () => {
    const { reader, calls } = createMockChainReader({ firstSlot: 100, secondSlot: 105 });
    const inspection = await readProposal(reader, {
      multisig: fixture.addresses.multisig,
      transactionIndex: 1n,
    });

    assert.equal(calls.length, 2);
    // Call 1: multisig, proposal, transaction
    assert.deepEqual(calls[0]?.addresses, [
      fixture.addresses.multisig,
      fixture.proposals['1'].proposal_address,
      fixture.proposals['1'].transaction_address,
    ]);
    assert.equal(calls[0]?.options, undefined);

    // Call 2: program, programData, buffer with minContextSlot 100
    assert.deepEqual(calls[1]?.addresses, [
      fixture.addresses.program,
      fixture.addresses.program_data,
      fixture.proposals['1'].buffer,
    ]);
    assert.equal(calls[1]?.options?.minContextSlot, 100);

    // Validate inspection payload
    assert.equal(inspection.multisig.address, fixture.addresses.multisig);
    assert.equal(inspection.multisig.threshold, 2);
    assert.equal(inspection.proposal.status.kind, 'Approved');
    assert.equal(inspection.proposal.contextSlot, 100);
    assert.equal(inspection.guard.shape, 'guarded-upgrade');
    assert.equal(inspection.instructions.length, 5);
    assert.equal(inspection.evidence.contextSlot, 105);
    assert.ok(inspection.evidence.program);
    assert.equal(inspection.evidence.program.programDataAddress, fixture.addresses.program_data);
    assert.ok(inspection.evidence.programData);
    assert.equal(inspection.evidence.programData.slot, 0n);
    assert.ok(inspection.evidence.buffer);
    assert.equal(inspection.evidence.buffer.authority, fixture.addresses.vault);
  });

  it('treats missing buffer in call 2 as data, not an exception', async () => {
    const { reader, calls } = createMockChainReader({ missingBuffer: true });
    const inspection = await readProposal(reader, {
      multisig: fixture.addresses.multisig,
      transactionIndex: 1n,
    });

    assert.equal(calls.length, 2);
    assert.equal(inspection.evidence.buffer, undefined);
    assert.ok(inspection.evidence.program);
    assert.ok(inspection.evidence.programData);
  });

  it('throws informative error when proposal account is missing', async () => {
    const { reader } = createMockChainReader();
    await assert.rejects(
      async () => {
        await readProposal(reader, {
          multisig: fixture.addresses.multisig,
          transactionIndex: 999n,
        });
      },
      /Proposal account not found for index 999/,
    );
  });
});
