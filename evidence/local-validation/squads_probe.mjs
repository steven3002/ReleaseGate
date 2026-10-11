/** Full local 2-of-2 Squads lifecycle, canonical deployed program snapshots.
 * No network submission; no phone; fixture ELF is unchanged across redeploys.
 */
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as sq from '@sqds/multisig';
import {Keypair,PublicKey,Transaction,TransactionInstruction,TransactionMessage,ComputeBudgetProgram,SYSVAR_CLOCK_PUBKEY,SYSVAR_RENT_PUBKEY} from '@solana/web3.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const bridge=spawn('python3',[path.join(root,'svm_server.py')],{env:process.env,stdio:['pipe','pipe','inherit']});
const pending=[];
createInterface({input:bridge.stdout}).on('line',line=>{
  const job=pending.shift();
  if(!job) throw new Error('Unexpected bridge output');
  const value=JSON.parse(line);
  value.error?job.reject(new Error(value.error)):job.resolve(value.result);
});
const call=req=>new Promise((resolve,reject)=>{pending.push({resolve,reject});bridge.stdin.write(JSON.stringify(req)+'\n');});
const payer=Keypair.generate(),second=Keypair.generate(),createKey=Keypair.generate();
const program=Keypair.generate().publicKey,bufferA=Keypair.generate().publicKey,bufferB=Keypair.generate().publicKey,spill=Keypair.generate().publicKey;
const [multisigPda]=sq.getMultisigPda({createKey:createKey.publicKey});
const [vaultPda]=sq.getVaultPda({multisigPda,index:0});
const snapshot=JSON.parse(readFileSync(path.join(root,'squads-rpc-evidence.json'),'utf8'));
const config=sq.accounts.ProgramConfig.deserialize(Buffer.from(snapshot.snapshot.value[1].data[0],'base64'))[0];
const state=await call({op:'init',fund:[payer.publicKey.toBase58(),second.publicKey.toBase58(),vaultPda.toBase58(),spill.toBase58(),config.treasury.toBase58()],program:program.toBase58(),vault:vaultPda.toBase58(),buffers:[bufferA.toBase58(),bufferB.toBase58()]});
const pd=new PublicKey(state.programdata),LOADER=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),LIGHTHOUSE=new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');
const events=[];
function u64(value){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(value));return b;}
function leb(value){const b=[];while(value>=128){b.push((value&127)|128);value=Math.floor(value/128);}b.push(value);return Buffer.from(b);}
function assertion(target,data){return new TransactionInstruction({programId:LIGHTHOUSE,data,keys:[{pubkey:target,isSigner:false,isWritable:false}]});}
function payload(buffer,slotGuard){
  const list=[assertion(buffer,Buffer.concat([Buffer.from([5,1,2]),LOADER.toBuffer(),Buffer.from([0])])),
    assertion(buffer,Buffer.concat([Buffer.from([5,1,1]),u64(state.code_bytes+37),Buffer.from([0])])),
    assertion(buffer,Buffer.concat([Buffer.from([5,1,8]),Buffer.from(state.code_keccak,'hex'),leb(37),leb(state.code_bytes)]))];
  if(slotGuard)list.push(assertion(pd,Buffer.concat([Buffer.from([13,1,3,1]),u64(0),Buffer.from([0])])));
  list.push(new TransactionInstruction({programId:LOADER,data:Buffer.from([3,0,0,0]),keys:[
    {pubkey:pd,isSigner:false,isWritable:true},{pubkey:program,isSigner:false,isWritable:true},
    {pubkey:buffer,isSigner:false,isWritable:true},{pubkey:spill,isSigner:false,isWritable:true},
    {pubkey:SYSVAR_RENT_PUBKEY,isSigner:false,isWritable:false},{pubkey:SYSVAR_CLOCK_PUBKEY,isSigner:false,isWritable:false},
    {pubkey:vaultPda,isSigner:true,isWritable:false}]}));
  return list;
}
async function send(name,instructions,signers=[payer],expected=true){
  // Make repeated execute requests distinct; a local failed signature is also
  // retained by the bank's replay cache. The tiny differing price is not a guard.
  const tx=new Transaction({recentBlockhash:state.blockhash,feePayer:payer.publicKey}).add(ComputeBudgetProgram.setComputeUnitLimit({units:1400000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:events.length}),...instructions);
  tx.sign(...signers);
  const result=await call({op:'tx',tx:tx.serialize().toString('base64')});
  events.push({name,expected_ok:expected,...result});
  if(result.ok!==expected)throw new Error(name+': '+result.error);
  return result;
}
const connection={getAccountInfo:async pubkey=>{const a=await call({op:'account',pubkey:pubkey.toBase58()});return a?{...a,data:Buffer.from(a.data,'base64'),owner:new PublicKey(a.owner)}:null;}};
try{
  await send('create_real_2_of_2_multisig',[sq.instructions.multisigCreateV2({treasury:config.treasury,creator:payer.publicKey,multisigPda,configAuthority:null,threshold:2,members:[{key:payer.publicKey,permissions:sq.types.Permissions.all()},{key:second.publicKey,permissions:sq.types.Permissions.all()}],timeLock:0,createKey:createKey.publicKey,rentCollector:null})],[payer,createKey]);
  const execute=async(index,name,expected=true)=>{const {instruction}=await sq.instructions.vaultTransactionExecute({connection,multisigPda,transactionIndex:BigInt(index),member:payer.publicKey});return send(name,[instruction],[payer],expected);};
  for(const [index,buffer,guard] of [[1,bufferA,true],[2,bufferA,false],[3,bufferB,true]]){
    const transactionIndex=BigInt(index);
    await send('create_proposal_'+index,[sq.instructions.vaultTransactionCreate({multisigPda,transactionIndex,creator:payer.publicKey,vaultIndex:0,ephemeralSigners:0,transactionMessage:new TransactionMessage({payerKey:vaultPda,recentBlockhash:state.blockhash,instructions:payload(buffer,guard)}),memo:'Local research: '+index}),sq.instructions.proposalCreate({multisigPda,transactionIndex,creator:payer.publicKey})]);
    await send('first_approval_'+index,[sq.instructions.proposalApprove({multisigPda,transactionIndex,member:payer.publicKey})]);
    if(index===1)await execute(1,'execution_before_second_approval',false);
    await send('second_approval_'+index,[sq.instructions.proposalApprove({multisigPda,transactionIndex,member:second.publicKey})],[payer,second]);
  }
  const newer=await execute(3,'execute_newer_proposal_first');
  await call({op:'warp',slot:200});
  const blocked=await execute(1,'older_proposal_with_previous_slot_guard',false);
  const guardedProposalInfo=await connection.getAccountInfo(sq.getProposalPda({multisigPda,transactionIndex:1n})[0]);
  const guardedProposal=sq.accounts.Proposal.fromAccountInfo(guardedProposalInfo)[0].pretty();
  const accepted=await execute(2,'older_proposal_without_previous_slot_guard',true);
  const output={scope:'Local SVM, mainnet program snapshots, real create/propose/two approvals/execute; synthetic balances/program/buffers; same ELF redeployed so no code-semantics rollback claimed; no MWA or Seeker',
    addresses:{multisig:multisigPda.toBase58(),vault:vaultPda.toBase58(),program:program.toBase58()},
    events,guarded_proposal_after_failed_execute:guardedProposal,
    all_expected:events.every(e=>e.ok===e.expected_ok)&&blocked.programdata_slot===100&&accepted.programdata_slot===200&&blocked.programdata_sha256===newer.programdata_sha256&&guardedProposal.status==='Approved'&&blocked.logs.some(line=>line.includes('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95 failed'))};
  writeFileSync(path.join(root,'squads-results.json'),JSON.stringify(output,null,2));
  console.log(JSON.stringify({...output,events:events.map(({logs,...rest})=>rest)},null,2));
}finally{bridge.stdin.end();}
