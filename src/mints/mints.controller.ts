// src/mints/mints.controller.ts
import { Body, Controller, Get, Inject, MessageEvent, Post, Query, Sse } from '@nestjs/common';
import { Connection } from '@solana/web3.js';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SOLANA_CONNECTION } from '../core/solana.connection';
import { LaunchpadsService } from '../launchpads/launchpads.service';
import { EventsStore } from './events.store';
import { MintInfoService } from './mint-info.service';
import { RouteService } from './route.service';
import { StageService } from './stage.service';

type Source = 'spl-token' | 'token-2022' | 'pumpfun';
type OwnerLabel = 'none' | 'no-account' | 'system' | 'spl-token' | 'token-2022' | 'pumpfun' | 'other';

function parseCsv<T extends string>(q?: string): T[] {
    return (q ?? '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean) as T[];
}

@Controller()
export class MintsController {
    
    constructor(
        @Inject(SOLANA_CONNECTION) private readonly conn: Connection,
        private readonly store: EventsStore,
        private readonly mintInfo: MintInfoService,
        private readonly routes: RouteService,
        private readonly stage: StageService,
        private readonly launchpads: LaunchpadsService, // <-- NUEVO
      ) {}

    @Get('/mints')
    getMints(
        @Query('limit') limitQ?: string,
        @Query('offset') offsetQ?: string,
        @Query('source') sourceQ?: string,     // ej: "spl-token,token-2022"
        @Query('minDec') minDecQ?: string,     // ej: "5"
        @Query('maxDec') maxDecQ?: string,     // ej: "9"
        @Query('ownerMint') ownerMintQ?: string,    // ej: "pumpfun,none"
        @Query('ownerFreeze') ownerFreezeQ?: string,// ej: "none"
        @Query('stage') stage?: 'pumpfun' | 'post-migration',
    ) {
        // --- paginación ---
        const limit = Math.max(1, Math.min(parseInt(limitQ ?? '50', 10) || 50, 500));
        const offset = Math.max(0, parseInt(offsetQ ?? '0', 10) || 0);

        // --- filtros base ---
        const sources = parseCsv<Source>(sourceQ);
        const minDec = minDecQ != null ? parseInt(minDecQ, 10) : 5;
        const maxDec = maxDecQ != null ? parseInt(maxDecQ, 10) : 9;

        // --- autoridad (explícito) ---
        let ownerMint = parseCsv<OwnerLabel>(ownerMintQ);
        let ownerFreeze = parseCsv<OwnerLabel>(ownerFreezeQ);

        // snapshot completo (ordenado más reciente primero)
        let items = this.store.snapshot()

        // source
        if (sources.length) {
            items = items.filter(e => sources.includes(e.source as Source));
        }

        // stage (azúcar)
        if (stage === 'pumpfun') {
            items = items.filter(e =>
                e.details?.authorityOwner?.mint?.label === 'pumpfun' &&
                (e.details?.freezeAuthority ?? null) === null
            );
        } else if (stage === 'post-migration') {
            items = items.filter(e =>
                (e.details?.mintAuthority ?? null) === null &&
                (e.details?.freezeAuthority ?? null) === null
            );
        }

        // decimales
        if (minDec != null || maxDec != null) {
            items = items.filter(e => {
                const d = e.details?.decimals;
                if (d == null) return false;
                if (minDec != null && d < minDec) return false;
                if (maxDec != null && d > maxDec) return false;
                return true;
            });
        }

        // ownerMint / ownerFreeze (si vienen)
        if (ownerMint.length) {
            items = items.filter(e => {
                const label: OwnerLabel = (e.details?.authorityOwner?.mint?.label ?? 'none') as OwnerLabel;
                return ownerMint.includes(label);
            });
        }
        if (ownerFreeze.length) {
            items = items.filter(e => {
                const label: OwnerLabel = (e.details?.authorityOwner?.freeze?.label ?? 'none') as OwnerLabel;
                return ownerFreeze.includes(label);
            });
        }

        // total antes de paginar
        const total = items.length;

        // paginación offset/limit
        const paged = items.slice(offset, offset + limit);

        return { total, offset, limit, items: paged };
    }

    // Stream en tiempo real (sin filtros; puedes filtrar en el front o agregar un SSE filtrado luego)
    @Sse('/mints/stream')
    stream(): Observable<MessageEvent> {
        return this.store.stream().pipe(map((data) => ({ data })));
    }

    @Get('/health')
    health() { return { ok: true, ts: Date.now() }; }


    @Get('/launchpads')
    listLaunchpads() {
        return { available: this.launchpads.getAvailable(), active: this.launchpads.getActive() };
    }

    @Get('/launchpads/active')
    listActive() {
        return { active: this.launchpads.getActive() };
    }

    @Post('/launchpads/select')
    async select(@Body() body: { names?: string[] }) {
        const names = Array.isArray(body?.names) ? body.names : [];
        await this.launchpads.setActive(names);
        return { active: this.launchpads.getActive() };
    }
}
