import { Injectable } from '@nestjs/common';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { Inject } from '@nestjs/common';
import { SOLANA_CONNECTION } from '../core/solana.connection';
import { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { LaunchpadsService } from '../launchpads/launchpads.service';

@Injectable()
export class MintInfoService {
  constructor(
    @Inject(SOLANA_CONNECTION) private readonly conn: Connection,
    private readonly launchpads: LaunchpadsService,
  ) {}

  async safeGetMintInfo(mint: PublicKey) {
    try { return await getMint(this.conn, mint, 'confirmed', TOKEN_2022_PROGRAM_ID); } catch {}
    try { return await getMint(this.conn, mint, 'confirmed', TOKEN_PROGRAM_ID); } catch {}
    return null;
  }

  async classifyAuthorityOwner(pk: PublicKey | null) {
    if (!pk) return { label: 'none' as const, programId: null };
    const acc = await this.conn.getAccountInfo(pk);
    if (!acc) return { label: 'no-account' as const, programId: null };
    const owner = acc.owner;

    const lp = this.launchpads.classifyOwnerProgram(owner);
    if (lp) return { label: 'launchpad' as const, tag: lp.tag, programId: owner.toBase58() };

    if (owner.equals(SystemProgram.programId))  return { label: 'system' as const, programId: owner.toBase58() };
    if (owner.equals(TOKEN_PROGRAM_ID))         return { label: 'spl-token' as const, programId: owner.toBase58() };
    if (owner.equals(TOKEN_2022_PROGRAM_ID))    return { label: 'token-2022' as const, programId: owner.toBase58() };
    return { label: 'other' as const, programId: owner.toBase58() };
  }
}
