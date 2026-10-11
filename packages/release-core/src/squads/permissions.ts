export interface MemberPermissions {
  readonly initiate: boolean;
  readonly vote: boolean;
  readonly execute: boolean;
  readonly rawMask: number;
}

export interface MemberCapabilities {
  readonly isMember: boolean;
  readonly initiate: boolean;
  readonly vote: boolean;
  readonly execute: boolean;
}

export const PERMISSION_INITIATE = 1;
export const PERMISSION_VOTE = 2;
export const PERMISSION_EXECUTE = 4;
export const PERMISSIONS_ALL_MASK = 7;

export function parsePermissions(mask: number): MemberPermissions {
  return {
    initiate: (mask & PERMISSION_INITIATE) !== 0,
    vote: (mask & PERMISSION_VOTE) !== 0,
    execute: (mask & PERMISSION_EXECUTE) !== 0,
    rawMask: mask,
  };
}

export function getMemberCapabilities(
  members: readonly { address: string; permissions: MemberPermissions }[],
  memberAddress: string | null | undefined
): MemberCapabilities {
  if (!memberAddress) {
    return { isMember: false, initiate: false, vote: false, execute: false };
  }
  const m = members.find(item => item.address === memberAddress);
  if (!m) {
    return { isMember: false, initiate: false, vote: false, execute: false };
  }
  return {
    isMember: true,
    initiate: m.permissions.initiate,
    vote: m.permissions.vote,
    execute: m.permissions.execute,
  };
}
