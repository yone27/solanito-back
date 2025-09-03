// src/launchpads/pumpfun.curve.ts
import { Connection, PublicKey } from '@solana/web3.js';

export const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'); // oficial

/** PDA = findProgramAddress(["bonding-curve", mint]) */
export function derivePumpfunBondingCurvePda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMPFUN_PROGRAM_ID,
  );
  return pda;
}

export type BondingCurveAccount = {
  discriminator: bigint;             // u64
  virtual_token_reserves: bigint;    // u64
  virtual_sol_reserves: bigint;      // u64
  real_token_reserves: bigint;       // u64
  real_sol_reserves: bigint;         // u64
  token_total_supply: bigint;        // u64
  complete: boolean;                 // bool (borsh -> u8)
  creator: PublicKey;                // Pubkey
};

/** Decodifica Borsh según layout público del crate `pumpfun` */
export function decodePumpfunBondingCurve(data: Buffer): BondingCurveAccount {
  let o = 0;
  const u64 = () => {
    const v =
      BigInt(data[o]) |
      (BigInt(data[o + 1]) << 8n) |
      (BigInt(data[o + 2]) << 16n) |
      (BigInt(data[o + 3]) << 24n) |
      (BigInt(data[o + 4]) << 32n) |
      (BigInt(data[o + 5]) << 40n) |
      (BigInt(data[o + 6]) << 48n) |
      (BigInt(data[o + 7]) << 56n);
    o += 8;
    return v;
  };
  const discriminator = u64();
  const virtual_token_reserves = u64();
  const virtual_sol_reserves = u64();
  const real_token_reserves = u64();
  const real_sol_reserves = u64();
  const token_total_supply = u64();
  const complete = !!data[o++]; // bool
  const creator = new PublicKey(data.subarray(o, (o += 32)));

  return {
    discriminator,
    virtual_token_reserves,
    virtual_sol_reserves,
    real_token_reserves,
    real_sol_reserves,
    token_total_supply,
    complete,
    creator,
  };
}

/** Lee la cuenta on-chain y devuelve stats útiles de la curva */
export async function fetchPumpfunCurveStats(conn: Connection, mint: PublicKey) {
  const pda = derivePumpfunBondingCurvePda(mint);
  const info = await conn.getAccountInfo(pda, 'confirmed');
  if (!info?.data) return null;

  const acc = decodePumpfunBondingCurve(info.data);

  // Progreso de curva aprox: porcentaje de tokens vendidos (desde el total reservado)
  // sold = token_total_supply - real_token_reserves
  const sold = Number(acc.token_total_supply - acc.real_token_reserves);
  const total = Number(acc.token_total_supply || 1n);
  const curveProgressPct = Math.max(0, Math.min(100, (sold / total) * 100));

  // MC en SOL (fórmula pública del módulo): token_total_supply * virtual_sol_reserves / virtual_token_reserves
  const marketCapSol =
    acc.virtual_token_reserves === 0n
      ? 0
      : Number(
          (acc.token_total_supply * acc.virtual_sol_reserves) /
            acc.virtual_token_reserves,
        );

  return {
    pda,
    curve: acc,
    curveProgressPct,
    marketCapSol,
    complete: acc.complete,
  };
}
