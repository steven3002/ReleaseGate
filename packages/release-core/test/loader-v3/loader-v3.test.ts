import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import {
  BUFFER_HEADER_SIZE,
  LOADER_INSTRUCTION_UPGRADE,
  LOADER_STATE_BUFFER,
  LOADER_STATE_PROGRAM,
  LOADER_STATE_PROGRAM_DATA,
  PROGRAMDATA_HEADER_SIZE,
  PROGRAM_HEADER_SIZE,
} from '../../src/loader-v3/layout';
import {
  decodeBufferAccount,
  decodeLoaderAccount,
  decodeProgramAccount,
  decodeProgramDataAccount,
} from '../../src/loader-v3/accounts';
import { deriveProgramDataAddress } from '../../src/loader-v3/program-data-address';
import {
  decodeUpgradeInstruction,
  encodeUpgradeInstruction,
} from '../../src/loader-v3/upgrade-instruction';
import {
  LOADER_V3_PROGRAM_ID,
  SYSVAR_CLOCK_ID,
  SYSVAR_RENT_ID,
} from '../../src/cluster/programs';

describe('loader-v3 layout constants', () => {
  it('matches confirmed metadata sizes and variant tags (C-LDR-01, C-LDR-02)', () => {
    assert.equal(BUFFER_HEADER_SIZE, 37);
    assert.equal(PROGRAM_HEADER_SIZE, 36);
    assert.equal(PROGRAMDATA_HEADER_SIZE, 45);
    assert.equal(LOADER_STATE_BUFFER, 1);
    assert.equal(LOADER_STATE_PROGRAM, 2);
    assert.equal(LOADER_STATE_PROGRAM_DATA, 3);
    assert.equal(LOADER_INSTRUCTION_UPGRADE, 3);
  });
});

describe('deriveProgramDataAddress', () => {
  it('derives confirmed addresses for Squads and Lighthouse programs (C-PRG-01, C-PRG-02)', () => {
    const squads = deriveProgramDataAddress('SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf');
    assert.equal(squads, 'Fy3YMJCvwbAXUgUM5b91ucUVA3jYzwWLHL3MwBqKsh8n');

    const lighthouse = deriveProgramDataAddress('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');
    assert.equal(lighthouse, 'CJ5WEjifs4d77pEA9DpewppByFjHcAkNv3YYSuSoDk7c');
  });
});

describe('loader-v3 account decoders', () => {
  it('decodes buffer account with authority and payload', () => {
    const auth = new PublicKey('11111111111111111111111111111112');
    const payload = new Uint8Array([10, 20, 30, 40]);
    const bufferData = new Uint8Array(BUFFER_HEADER_SIZE + payload.length);
    const view = new DataView(bufferData.buffer);
    view.setUint32(0, LOADER_STATE_BUFFER, true);
    bufferData[4] = 1; // Some
    bufferData.set(auth.toBytes(), 5);
    bufferData.set(payload, BUFFER_HEADER_SIZE);

    const res = decodeBufferAccount(bufferData);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.authority, auth.toBase58());
      assert.deepEqual(res.value.payload, payload);
    }

    const loaderRes = decodeLoaderAccount(bufferData);
    assert.equal(loaderRes.ok, true);
    if (loaderRes.ok) {
      assert.equal(loaderRes.value.kind, 'buffer');
    }
  });

  it('decodes program account', () => {
    const pd = new PublicKey('11111111111111111111111111111112');
    const data = new Uint8Array(PROGRAM_HEADER_SIZE);
    const view = new DataView(data.buffer);
    view.setUint32(0, LOADER_STATE_PROGRAM, true);
    data.set(pd.toBytes(), 4);

    const res = decodeProgramAccount(data);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.programDataAddress, pd.toBase58());
    }
  });

  it('decodes program-data account with slot and authority', () => {
    const auth = new PublicKey('11111111111111111111111111111112');
    const payload = new Uint8Array([1, 2, 3]);
    const data = new Uint8Array(PROGRAMDATA_HEADER_SIZE + payload.length);
    const view = new DataView(data.buffer);
    view.setUint32(0, LOADER_STATE_PROGRAM_DATA, true);
    view.setBigUint64(4, 500n, true);
    data[12] = 1; // Some
    data.set(auth.toBytes(), 13);
    data.set(payload, PROGRAMDATA_HEADER_SIZE);

    const res = decodeProgramDataAccount(data);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.slot, 500n);
      assert.equal(res.value.upgradeAuthority, auth.toBase58());
      assert.deepEqual(res.value.payload, payload);
    }
  });

  it('returns typed errors on truncated or invalid account buffers', () => {
    assert.equal(decodeBufferAccount(new Uint8Array(36)).ok, false);
    assert.equal(decodeProgramAccount(new Uint8Array(35)).ok, false);
    assert.equal(decodeProgramDataAccount(new Uint8Array(44)).ok, false);

    const badTagData = new Uint8Array(45);
    new DataView(badTagData.buffer).setUint32(0, 99, true);
    assert.equal(decodeLoaderAccount(badTagData).ok, false);
  });
});

describe('loader-v3 upgrade instruction', () => {
  const accounts = {
    programData: 'CwvqZPbNrPEizu66jGhLEmB77mNqJvfYGs3ziCrqrVGi',
    program: 'CxKhVB8eyBawrEmaqBkRmcVN47RJya1SSpxYiygR9tpJ',
    buffer: 'J7KoxDEA5v3z7ARXhBUtWj4ZqRQ7LjDNy9J8PGf29XwB',
    spill: 'FPXkuSiG8EBc3Rrd9W1HfKsxVYZP8VErjpg36mx63z7F',
    rentSysvar: SYSVAR_RENT_ID,
    clockSysvar: SYSVAR_CLOCK_ID,
    authority: 'G8jZGsyWv1dGJP89ujJteoDpQCuh5yAN3pn6DqiJGbcB',
  };

  it('round-trips encode and decode with exact accounts and permissions', () => {
    const ix = encodeUpgradeInstruction(accounts);
    assert.equal(ix.programId, LOADER_V3_PROGRAM_ID);
    assert.deepEqual(ix.data, new Uint8Array([3, 0, 0, 0]));
    assert.equal(ix.accounts.length, 7);

    const decoded = decodeUpgradeInstruction(ix);
    assert.equal(decoded.ok, true);
    if (decoded.ok) {
      assert.deepEqual(decoded.accounts, accounts);
    }
  });

  it('rejects wrong program, wrong opcode, wrong account count, or wrong privileges', () => {
    const ix = encodeUpgradeInstruction(accounts);

    assert.equal(decodeUpgradeInstruction({ ...ix, programId: '11111111111111111111111111111111' }).ok, false);
    assert.equal(decodeUpgradeInstruction({ ...ix, data: new Uint8Array([4, 0, 0, 0]) }).ok, false);
    assert.equal(decodeUpgradeInstruction({ ...ix, data: new Uint8Array([3, 0, 0]) }).ok, false);
    assert.equal(decodeUpgradeInstruction({ ...ix, accounts: ix.accounts.slice(0, 6) }).ok, false);

    // Authority must be signer
    const badAuth = { ...ix, accounts: ix.accounts.map((a, i) => i === 6 ? { ...a, isSigner: false } : a) };
    assert.equal(decodeUpgradeInstruction(badAuth).ok, false);

    // Program data must not be signer
    const badPd = { ...ix, accounts: ix.accounts.map((a, i) => i === 0 ? { ...a, isSigner: true } : a) };
    assert.equal(decodeUpgradeInstruction(badPd).ok, false);
  });
});
