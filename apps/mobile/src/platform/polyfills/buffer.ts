import { Buffer } from 'buffer';

// Hermes defines no global Buffer. The Squads SDK reaches @solana/spl-token-metadata, which reads
// the global while its module is evaluated, so the global has to exist before any Solana import.
const scope = globalThis as { Buffer?: typeof Buffer };

if (scope.Buffer === undefined) {
  scope.Buffer = Buffer;
}
