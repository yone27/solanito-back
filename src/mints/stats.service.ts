import { Injectable } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import { SolPriceService } from './sol-price.service';

type DexPair = {
    priceUsd?: string;
    priceNative?: string;             // 👈 puede venir (SOL)
    liquidity?: { usd?: number };
    volume?: Record<string, number>;
    fdv?: number;
    marketCap?: number;
    dexId?: string;
    pairAddress?: string;
};

function toNum(x: any) { const n = typeof x === 'string' ? Number(x) : x; return Number.isFinite(n) ? n : null; }

@Injectable()
export class StatsService {
    constructor(private readonly solPrice: SolPriceService) { }
    private cache = new Map<string, { ts: number; data: any | null }>();
    private readonly TTL_MS = 15_000;

    private pickBest(pairs: DexPair[]) {
        if (!Array.isArray(pairs) || !pairs.length) return null;
        return [...pairs].sort((a, b) => (toNum(b?.liquidity?.usd) ?? 0) - (toNum(a?.liquidity?.usd) ?? 0))[0];
    }

    async getDexScreenerStats(mint: PublicKey) {
        const key = mint.toBase58(), now = Date.now();
        const hit = this.cache.get(key); if (hit && now - hit.ts < this.TTL_MS) return hit.data;

        try {
            const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${key}`);
            if (!r.ok) throw new Error(`DexScreener ${r.status}`);
            const pairs: DexPair[] = await r.json();
            const best = this.pickBest(pairs);
            if (!best) { this.cache.set(key, { ts: now, data: null }); return null; }

            const volume24h = best.volume?.h24 ?? best.volume?.['24h'] ?? best.volume?.day ?? null;
            // priceNative = precio en SOL si lo provee la API; si no, lo calculamos
            let priceSol = toNum(best.priceNative);
            const priceUsd = toNum(best.priceUsd);
            if (priceSol == null && priceUsd != null) {
                const solUsd = await this.solPrice.getSolUsd();
                if (solUsd) priceSol = priceUsd / solUsd;
            }

            const data = {
                dexId: best.dexId ?? null,
                pairAddress: best.pairAddress ?? null,
                priceUsd,
                priceSol,
                liquidityUsd: toNum(best.liquidity?.usd),
                volume24h: toNum(volume24h),
                fdv: toNum(best.fdv),
                marketCap: toNum(best.marketCap),
                source: 'dexscreener' as const,
            };
            this.cache.set(key, { ts: now, data });
            return data;
        } catch {
            this.cache.set(key, { ts: now, data: null });
            return null;
        }
    }
}
