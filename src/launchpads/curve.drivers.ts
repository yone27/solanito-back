import { Connection, PublicKey } from '@solana/web3.js';
import { PUMPFUN_PROGRAM_ID, derivePumpfunBondingCurvePda, fetchPumpfunCurveStats } from './pumpfun.curve';

export type CurveStats = { curveProgressPct?: number | null; mcSol?: number | null; complete?: boolean | null };

export interface CurveDriver {
    /** nombre corto que usarás en el front como launchpad tag (pumpfun, bonkpad, moonit, ...) */
    name: string;
    /** ProgramId del launchpad (para taggeo básico si no hay PDA/decoder) */
    programId: PublicKey;

    /** detección opcional por PDA (más robusta que mirar authorities) */
    detect?: (conn: Connection, mint: PublicKey) => Promise<boolean>;

    /** lectura/decodificación de stats on-chain (si aplica) */
    readStats?: (conn: Connection, mint: PublicKey) => Promise<CurveStats | null>;
}

/* === Pump.fun driver (completo) === */
export const pumpfunDriver: CurveDriver = {
    name: 'pumpfun',
    programId: PUMPFUN_PROGRAM_ID,
    detect: async (conn, mint) => {
        const pda = derivePumpfunBondingCurvePda(mint);
        const acc = await conn.getAccountInfo(pda, 'confirmed');
        return !!acc && acc.owner.equals(PUMPFUN_PROGRAM_ID);
    },
    readStats: async (conn, mint) => {
        const s = await fetchPumpfunCurveStats(conn, mint);
        if (!s) return null;
        return { curveProgressPct: s.curveProgressPct, mcSol: s.marketCapSol, complete: s.complete };
    },
};

/* === Stubs para otros launchpads (añade seeds/layout cuando los tengas) === */
// Ejemplo de placeholder: etiqueta por programId, sin stats
export function makeTagOnlyDriver(name: string, programId: PublicKey): CurveDriver {
    return {
        name,
        programId,
        // detect opcional: podrías mirar si alguna cuenta PDA conocida existe cuando tengas seeds
        readStats: async () => null,
    };
}

// Exporta el registro; agrega aquí cuando implementes otro
export const curveDrivers: CurveDriver[] = [
    pumpfunDriver,
    // makeTagOnlyDriver('bonkpad', new PublicKey('<PROGRAM_ID_BONKPAD>')),
    // makeTagOnlyDriver('moonit',  new PublicKey('<PROGRAM_ID_MOONIT>')),
    // …etc.
];
