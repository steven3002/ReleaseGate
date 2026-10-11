export type LighthouseAssertion =
  | {
      readonly kind: 'buffer-owner';
      readonly target: string;
      readonly owner: string;
    }
  | {
      readonly kind: 'buffer-length';
      readonly target: string;
      readonly length: bigint;
    }
  | {
      readonly kind: 'buffer-hash';
      readonly target: string;
      readonly keccak256: string;
      readonly start: bigint;
      readonly length: bigint;
    }
  | {
      readonly kind: 'program-data-slot';
      readonly target: string;
      readonly slot: bigint;
    };
