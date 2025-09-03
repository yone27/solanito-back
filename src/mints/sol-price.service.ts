import { Injectable } from '@nestjs/common';

@Injectable()
export class SolPriceService {
    private cache?: { ts: number; usd: number };
    private readonly TTL = 20_000;

    async getSolUsd(): Promise<number | null> {
        const now = Date.now();
        if (this.cache && now - this.cache.ts < this.TTL) return this.cache.usd;

        // 1) CoinGecko Simple Price
        try {
            const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            const j = await r.json();
            const usd = Number(j?.solana?.usd);
            if (Number.isFinite(usd)) {
                this.cache = { ts: now, usd };
                return usd;
            }
        } catch { }

        // 2) Fallback DexScreener: mejor par de SOL con USD (agarra priceUsd)
        try {
            const r = await fetch('https://api.dexscreener.com/tokens/v1/solana/So11111111111111111111111111111111111111112');
            const arr = await r.json();
            const best = Array.isArray(arr) ? arr.sort((a, b) => (+(b?.liquidity?.usd || 0)) - (+(a?.liquidity?.usd || 0)))[0] : null;
            const usd = Number(best?.priceUsd);
            if (Number.isFinite(usd)) {
                this.cache = { ts: now, usd };
                return usd;
            }
        } catch { }

        return null;
    }
}
