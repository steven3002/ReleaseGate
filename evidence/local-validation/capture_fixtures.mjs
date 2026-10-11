/**
 * Fixture capture for the release-core tests.
 *
 * Replays the starter's local 2-of-2 Squads lifecycle with deterministic keys and
 * records, at named points, the raw account data produced by the real Squads,
 * Lighthouse and upgradeable-loader programs running in the local SVM bridge.
 * Nothing is broadcast to any network.
 *
 * Usage: node capture_fixtures.mjs <output.json>
 * Requires the starter environment (venv with solders, npm ci, fetched program snapshots).
 */
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as sq from '@sqds/multisig';
import {keccak_256} from '@noble/hashes/sha3';
import {
  ComputeBudgetProgram, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY,
  Transaction, TransactionInstruction, TransactionMessage,
} from '@solana/web3.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const outputPath = process.argv[2];
if (!outputPath) throw new Error('usage: node capture_fixtures.mjs <output.json>');

const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const LIGHTHOUSE = new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');
const BUFFER_HEADER = 37;
const PROGRAMDATA_HEADER = 45;

const bridge = spawn('python3', [path.join(root, 'svm_server.py')], {env: process.env, stdio: ['pipe', 'pipe', 'inherit']});
const pending = [];
createInterface({input: bridge.stdout}).on('line', line => {
  const job = pending.shift();
  if (!job) throw new Error('Unexpected bridge output');
  const value = JSON.parse(line);
  value.error ? job.reject(new Error(value.error)) : job.resolve(value.result);
});
const call = req => new Promise((resolve, reject) => { pending.push({resolve, reject}); bridge.stdin.write(JSON.stringify(req) + '\n'); });

const fixedKeypair = tag => Keypair.fromSeed(createHash('sha256').update('releasegate-fixture:' + tag).digest());
const memberOne = fixedKeypair('member-one');
const memberTwo = fixedKeypair('member-two');
const createKey = fixedKeypair('create-key');
const program = fixedKeypair('program').publicKey;
const bufferA = fixedKeypair('buffer-a').publicKey;
const bufferB = fixedKeypair('buffer-b').publicKey;
const spill = fixedKeypair('spill').publicKey;

const [multisigPda] = sq.getMultisigPda({createKey: createKey.publicKey});
const [vaultPda] = sq.getVaultPda({multisigPda, index: 0});
const snapshot = JSON.parse(readFileSync(path.join(root, 'squads-rpc-evidence.json'), 'utf8'));
const config = sq.accounts.ProgramConfig.deserialize(Buffer.from(snapshot.snapshot.value[1].data[0], 'base64'))[0];

const state = await call({
  op: 'init',
  fund: [memberOne.publicKey, memberTwo.publicKey, vaultPda, spill, config.treasury].map(k => k.toBase58()),
  program: program.toBase58(), vault: vaultPda.toBase58(), buffers: [bufferA.toBase58(), bufferB.toBase58()],
});
const programData = new PublicKey(state.programdata);
const INITIAL_SLOT = 0;

const u64 = value => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; };
const leb = value => { const b = []; while (value >= 128) { b.push((value & 127) | 128); value = Math.floor(value / 128); } b.push(value); return Buffer.from(b); };
const assertion = (target, data) => new TransactionInstruction({programId: LIGHTHOUSE, data, keys: [{pubkey: target, isSigner: false, isWritable: false}]});

function innerInstructions(buffer, withSlotCondition) {
  const list = [
    assertion(buffer, Buffer.concat([Buffer.from([5, 1, 2]), LOADER.toBuffer(), Buffer.from([0])])),
    assertion(buffer, Buffer.concat([Buffer.from([5, 1, 1]), u64(state.code_bytes + BUFFER_HEADER), Buffer.from([0])])),
    assertion(buffer, Buffer.concat([Buffer.from([5, 1, 8]), Buffer.from(state.code_keccak, 'hex'), leb(BUFFER_HEADER), leb(state.code_bytes)])),
  ];
  if (withSlotCondition) list.push(assertion(programData, Buffer.concat([Buffer.from([13, 1, 3, 1]), u64(INITIAL_SLOT), Buffer.from([0])])));
  list.push(new TransactionInstruction({programId: LOADER, data: Buffer.from([3, 0, 0, 0]), keys: [
    {pubkey: programData, isSigner: false, isWritable: true}, {pubkey: program, isSigner: false, isWritable: true},
    {pubkey: buffer, isSigner: false, isWritable: true}, {pubkey: spill, isSigner: false, isWritable: true},
    {pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false}, {pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false},
    {pubkey: vaultPda, isSigner: true, isWritable: false}]}));
  return list;
}

const events = [];
async function send(name, instructions, signers, expected = true) {
  const tx = new Transaction({recentBlockhash: state.blockhash, feePayer: memberOne.publicKey}).add(
    ComputeBudgetProgram.setComputeUnitLimit({units: 1_400_000}),
    ComputeBudgetProgram.setComputeUnitPrice({microLamports: events.length}),
    ...instructions);
  tx.sign(...signers);
  const result = await call({op: 'tx', tx: tx.serialize().toString('base64')});
  events.push({name, expected_ok: expected, ok: result.ok, error: result.error, compute_units: result.compute_units, logs: result.logs});
  if (result.ok !== expected) throw new Error(name + ': ' + result.error);
  return result;
}

const fetchRaw = async pubkey => call({op: 'account', pubkey: pubkey.toBase58()});
const connection = {getAccountInfo: async pubkey => { const a = await fetchRaw(pubkey); return a ? {...a, data: Buffer.from(a.data, 'base64'), owner: new PublicKey(a.owner)} : null; }};

function describeLarge(raw, headerLength) {
  if (!raw) return null;
  const data = Buffer.from(raw.data, 'base64');
  const payload = data.subarray(headerLength);
  return {
    owner: raw.owner, lamports: raw.lamports, executable: raw.executable, data_length: data.length,
    header_hex: data.subarray(0, headerLength).toString('hex'), payload_length: payload.length,
    payload_sha256: createHash('sha256').update(payload).digest('hex'),
    payload_keccak256: Buffer.from(keccak_256(payload)).toString('hex'),
  };
}
const describeSmall = raw => raw && ({owner: raw.owner, lamports: raw.lamports, executable: raw.executable, data_base64: raw.data});

const snapshots = {};
async function snap(label) {
  const entry = {multisig: describeSmall(await fetchRaw(multisigPda)), proposals: {}, transactions: {}};
  for (const index of [1n, 2n, 3n]) {
    entry.proposals[index] = describeSmall(await fetchRaw(sq.getProposalPda({multisigPda, transactionIndex: index})[0]));
    entry.transactions[index] = describeSmall(await fetchRaw(sq.getTransactionPda({multisigPda, index})[0]));
  }
  entry.program = describeSmall(await fetchRaw(program));
  entry.program_data = describeLarge(await fetchRaw(programData), PROGRAMDATA_HEADER);
  entry.buffer_a = describeLarge(await fetchRaw(bufferA), BUFFER_HEADER);
  entry.buffer_b = describeLarge(await fetchRaw(bufferB), BUFFER_HEADER);
  snapshots[label] = entry;
}

const plan = [
  {index: 1, buffer: bufferA, slotCondition: true, label: 'guarded release against buffer A'},
  {index: 2, buffer: bufferA, slotCondition: false, label: 'same upgrade without the deployment-slot condition'},
  {index: 3, buffer: bufferB, slotCondition: true, label: 'guarded release against buffer B'},
];
const proposals = {};

try {
  await send('create_multisig', [sq.instructions.multisigCreateV2({
    treasury: config.treasury, creator: memberOne.publicKey, multisigPda, configAuthority: null, threshold: 2,
    members: [{key: memberOne.publicKey, permissions: sq.types.Permissions.all()}, {key: memberTwo.publicKey, permissions: sq.types.Permissions.all()}],
    timeLock: 0, createKey: createKey.publicKey, rentCollector: null})], [memberOne, createKey]);
  await snap('multisig-created');

  const execute = async (index, name, expected = true) => {
    const {instruction} = await sq.instructions.vaultTransactionExecute({connection, multisigPda, transactionIndex: BigInt(index), member: memberOne.publicKey});
    return send(name, [instruction], [memberOne], expected);
  };

  for (const {index, buffer, slotCondition, label} of plan) {
    const transactionIndex = BigInt(index);
    const instructions = innerInstructions(buffer, slotCondition);
    const message = new TransactionMessage({payerKey: vaultPda, recentBlockhash: state.blockhash, instructions});
    proposals[index] = {
      label, buffer: buffer.toBase58(), slot_condition: slotCondition,
      inner_instructions: instructions.map(ix => ({
        program_id: ix.programId.toBase58(), data_hex: ix.data.toString('hex'),
        accounts: ix.keys.map(k => ({address: k.pubkey.toBase58(), is_signer: k.isSigner, is_writable: k.isWritable}))})),
      create_argument_message_hex: Buffer.from(sq.utils.transactionMessageToMultisigTransactionMessageBytes({message, vaultPda})).toString('hex'),
      transaction_address: sq.getTransactionPda({multisigPda, index: transactionIndex})[0].toBase58(),
      proposal_address: sq.getProposalPda({multisigPda, transactionIndex})[0].toBase58(),
    };
    await send('create_proposal_' + index, [
      sq.instructions.vaultTransactionCreate({multisigPda, transactionIndex, creator: memberOne.publicKey, vaultIndex: 0, ephemeralSigners: 0, transactionMessage: message}),
      sq.instructions.proposalCreate({multisigPda, transactionIndex, creator: memberOne.publicKey})], [memberOne]);
    if (index === 1) await snap('proposal-1-active-no-votes');
    await send('first_approval_' + index, [sq.instructions.proposalApprove({multisigPda, transactionIndex, member: memberOne.publicKey})], [memberOne]);
    if (index === 1) {
      await snap('proposal-1-active-one-approval');
      await execute(1, 'execute_before_threshold', false);
    }
    await send('second_approval_' + index, [sq.instructions.proposalApprove({multisigPda, transactionIndex, member: memberTwo.publicKey})], [memberOne, memberTwo]);
  }
  await snap('all-approved-before-any-execution');

  await execute(3, 'execute_newer_guarded_release');
  await snap('after-newer-release-executed');
  await call({op: 'warp', slot: 200});
  await execute(1, 'execute_older_guarded_release_blocked', false);
  await snap('after-older-release-blocked');
  await execute(2, 'execute_same_upgrade_without_slot_condition');
  await snap('after-unconditioned-upgrade-executed');

  const fixture = {
    description: 'Raw accounts produced by the deployed Squads v4, Lighthouse and upgradeable-loader programs in a local SVM. Synthetic balances, program and buffers; the same ELF is used for every buffer.',
    generated_utc: new Date().toISOString(),
    versions: {sqds_multisig: '2.1.4', solana_web3js: '1.98.4'},
    squads_program_snapshot: {endpoint: snapshot.endpoint, bytecode_sha256: snapshot.bytecode_sha256},
    constants: {squads_program: sq.PROGRAM_ID.toBase58(), lighthouse_program: LIGHTHOUSE.toBase58(), loader: LOADER.toBase58(), rent_sysvar: SYSVAR_RENT_PUBKEY.toBase58(), clock_sysvar: SYSVAR_CLOCK_PUBKEY.toBase58()},
    addresses: {
      multisig: multisigPda.toBase58(), create_key: createKey.publicKey.toBase58(), vault_index: 0, vault: vaultPda.toBase58(),
      member_one: memberOne.publicKey.toBase58(), member_two: memberTwo.publicKey.toBase58(),
      program: program.toBase58(), program_data: programData.toBase58(), buffer_a: bufferA.toBase58(), buffer_b: bufferB.toBase58(), spill: spill.toBase58(),
    },
    artifact: {length: state.code_bytes, keccak256: state.code_keccak, note: 'The payload is the Lighthouse ELF fetched by the starter; it is not stored in this fixture.'},
    slots: {initial_deployment_slot: INITIAL_SLOT, first_execution_slot: 100, second_execution_slot: 200},
    proposals, snapshots, events,
  };
  writeFileSync(outputPath, JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({written: outputPath, snapshots: Object.keys(snapshots), events: events.map(e => `${e.name}:${e.ok}`)}, null, 2));
} finally {
  bridge.stdin.end();
}
