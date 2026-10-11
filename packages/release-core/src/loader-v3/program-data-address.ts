import { PublicKey } from '@solana/web3.js';
import { LOADER_V3_PROGRAM_ID } from '../cluster/programs';

const LOADER_PUBKEY = new PublicKey(LOADER_V3_PROGRAM_ID);

/**
 * Derives the canonical ProgramData address for an upgradeable program under Loader-v3.
 * Seeds: `[program_id]`, Program: Loader-v3.
 */
export function deriveProgramDataAddress(programId: string): string {
  const programPubkey = new PublicKey(programId);
  const [pda] = PublicKey.findProgramAddressSync([programPubkey.toBuffer()], LOADER_PUBKEY);
  return pda.toBase58();
}
