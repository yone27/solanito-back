import { Injectable } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';

const JUP_QUOTE = 'https://quote-api.jup.ag/v6/quote';
const NATIVE_SOL = new PublicKey('So11111111111111111111111111111111111111112');

@Injectable()
export class RouteService {
  async hasJupRoute(outMint: PublicKey, slippageBps = 200): Promise<boolean> {
    try {
      const url = new URL(JUP_QUOTE);
      url.searchParams.set('inputMint', NATIVE_SOL.toBase58());
      url.searchParams.set('outputMint', outMint.toBase58());
      url.searchParams.set('amount', String(1_000_000)); // 0.001 SOL
      url.searchParams.set('slippageBps', String(slippageBps));
      url.searchParams.set('onlyDirectRoutes', 'false');
      const res = await fetch(url.toString());
      if (!res.ok) return false;
      const data: any = await res.json();
      return Array.isArray(data?.data) && data.data.length > 0;
    } catch { return false; }
  }
}
