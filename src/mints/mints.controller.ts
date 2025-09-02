import { Controller, Get, ParseIntPipe, Query, Sse, MessageEvent } from '@nestjs/common';
import { ListenerService } from '../listener/listener.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller()
export class MintsController {
    constructor(private readonly listener: ListenerService) { }

    @Get('/mints')
    getMints(
        @Query('limit') limitQ?: string,
        @Query('source') sourceQ?: string,          // p.ej: "spl-token,token-2022"
        @Query('minDec') minDecQ?: string,          // p.ej: "5"
        @Query('maxDec') maxDecQ?: string,          // p.ej: "9"
        @Query('requireRenounce') reqRenQ?: string, // "true" | "false"
        // 👇 NUEVO
        @Query('ownerMint') ownerMintQ?: string,      // p.ej. "pumpfun,none"
        @Query('ownerFreeze') ownerFreezeQ?: string,  // p.ej. "none"
        @Query('stage') stage?: 'pumpfun' | 'post-migration',
    ) {
        const limit = Math.max(1, Math.min(parseInt(limitQ ?? '50', 10) || 50, 500));
        const sources = (sourceQ ?? '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean) as Array<'spl-token' | 'token-2022' | 'pumpfun'>;

        const minDec = minDecQ != null ? parseInt(minDecQ, 10) : undefined;
        const maxDec = maxDecQ != null ? parseInt(maxDecQ, 10) : undefined;
        const requireRenounce = reqRenQ === 'true';

        const ownerMint = (ownerMintQ ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const ownerFreeze = (ownerFreezeQ ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

        let items = this.listener.getRecent(limit);

        if (sources.length) items = items.filter((e) => sources.includes(e.source));

        if (minDec != null || maxDec != null) {
            items = items.filter((e) => {
                const d = e.details?.decimals;
                if (d == null) return false; // si piden filtro de decimales y no tenemos dato, lo descartamos
                if (minDec != null && d < minDec) return false;
                if (maxDec != null && d > maxDec) return false;
                return true;
            });
        }

        if (requireRenounce) {
            items = items.filter(
                (e) => (e.details?.mintAuthority ?? null) === null && (e.details?.freezeAuthority ?? null) === null,
            );
        }
        // ---- Atajos de "stage"
        if (stage === 'pumpfun') {
            // permitir tokens en curva: mintAuthority presente y su owner clasificado como pumpfun
            items = items.filter(e => e.details?.authorityOwner?.mint?.label === 'pumpfun');
        } else if (stage === 'post-migration') {
            // ambos renunciados
            items = items.filter(
                e => (e.details?.mintAuthority ?? null) === null && (e.details?.freezeAuthority ?? null) === null,
            );
        }

        // ---- Filtros finos por owner label
        if (ownerMint.length) {
            items = items.filter(e => {
                const label = e.details?.authorityOwner?.mint?.label ?? 'none';
                return ownerMint.includes(label);
            });
        }

        if (ownerFreeze.length) {
            items = items.filter(e => {
                const label = e.details?.authorityOwner?.freeze?.label ?? 'none';
                return ownerFreeze.includes(label);
            });
        }

        return { total: items.length, items };
    }

    @Sse('/mints/stream')
    stream(): Observable<MessageEvent> {
        return this.listener.stream().pipe(map((data) => ({ data })));
    }

    @Get('/health')
    health() {
        return { ok: true, ts: Date.now() };
    }
}
