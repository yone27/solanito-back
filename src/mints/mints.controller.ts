// src/mints/mints.controller.ts
import { Body, Controller, Get, Inject, MessageEvent, Post, Query, Sse } from '@nestjs/common';
import { Observable, from, merge } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { LaunchpadsService } from '../launchpads/launchpads.service';
//import { EventsStore } from './events.store';
//import { MintInfoService } from './mint-info.service';
//import { RouteService } from './route.service';
//import { StageService } from './stage.service';
import { ListenerService } from 'src/listener/listener.service';

type Source = 'spl-token' | 'token-2022' | 'pumpfun';
type OwnerLabel = 'none' | 'no-account' | 'system' | 'spl-token' | 'token-2022' | 'launchpad' | 'other';
type Stage = 'pump' | 'newCreation' | 'almostBonded' | 'surge' | 'migrated';

function parseCsv<T extends string>(q?: string): T[] {
    return (q ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean) as T[];
}

@Controller()
export class MintsController {

    constructor(
        //private readonly store: EventsStore,
        //private readonly mintInfo: MintInfoService,
        //private readonly routes: RouteService,
        //private readonly stage: StageService,
        private readonly launchpads: LaunchpadsService, 
        private readonly listener: ListenerService
    ) { }

    // Stream en tiempo real (sin filtros; puedes filtrar en el front o agregar un SSE filtrado luego)
    @Sse('/mints/stream')
    stream(
        @Query('launchpad') launchpadQ?: string,               // ej: pumpfun,bonkpad
        @Query('stage') stage?: Stage,                         // ej: surge
        @Query('source') sourceQ?: string,                     // ej: spl-token,token-2022
        @Query('minDec') minDecQ?: string, @Query('maxDec') maxDecQ?: string,
        @Query('ownerMint') ownerMintQ?: string, @Query('ownerFreeze') ownerFreezeQ?: string,
        @Query('replay') replayQ?: string                      // ej: 50 (opcional)
    ): Observable<MessageEvent> {
        const launchpads = parseCsv<string>(launchpadQ);
        const sources = parseCsv<Source>(sourceQ);
        const ownerMint = parseCsv<OwnerLabel>(ownerMintQ);
        const ownerFreeze = parseCsv<OwnerLabel>(ownerFreezeQ);
        const minDec = minDecQ != null ? parseInt(minDecQ, 10) : undefined;
        const maxDec = maxDecQ != null ? parseInt(maxDecQ, 10) : undefined;
        const replay = Math.max(0, Math.min(parseInt(replayQ ?? '0', 10) || 0, 500));

        const predicate = (e: any) => {
            if (launchpads.length) {
                const tag = e.details?.authorityOwner?.mint?.tag ?? e.details?.curveTag;
                if (!tag || !launchpads.includes(String(tag).toLowerCase())) return false;
            }
            // stage (si el servicio ya lo computa y lo guarda; si no, usa computeStageFor)
            const st = e.stage ?? (this.listener as any).computeStageFor?.(e);

            if (stage && st !== stage) return false;

            // source
            if (sources.length && !sources.includes(e.source as Source)) return false;

            // decimales
            const d = e.details?.decimals;
            if ((minDec != null || maxDec != null)) {
                if (d == null) return false;
                if (minDec != null && d < minDec) return false;
                if (maxDec != null && d > maxDec) return false;
            }

            // owners
            if (ownerMint.length) {
                const lab = (e.details?.authorityOwner?.mint?.label ?? 'none') as OwnerLabel;
                if (!ownerMint.includes(lab)) return false;
            }
            if (ownerFreeze.length) {
                const lab = (e.details?.authorityOwner?.freeze?.label ?? 'none') as OwnerLabel;
                if (!ownerFreeze.includes(lab)) return false;
            }

            return true;
        };

        // Reenviar últimos N y luego tiempo real
        const recent = replay > 0 ? this.listener.getRecent(replay) : [];
        const start$ = from(recent);
        const live$ = this.listener.stream().pipe(filter(predicate));

        return merge(start$, live$).pipe(map((data) => ({ data })));
    }

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
