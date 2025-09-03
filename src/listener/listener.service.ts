import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';
import { Inject } from '@nestjs/common';
import { SOLANA_CONNECTION } from '../core/solana.connection';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { EventsStore } from '../mints/events.store';
import { MintInfoService } from '../mints/mint-info.service';
import { RouteService } from '../mints/route.service';
import { parseEnv } from '../core/env';
import { StageService } from '../mints/stage.service';

@Injectable()
export class ListenerService implements OnModuleInit {
    private readonly log = new Logger(ListenerService.name);
    private readonly seen = new Set<string>();
    private readonly env = parseEnv(process.env);

    constructor(
        @Inject(SOLANA_CONNECTION) private readonly conn: Connection,
        private readonly store: EventsStore,
        private readonly mintInfo: MintInfoService,
        private readonly routes: RouteService,
        private readonly stage: StageService,
    ) { }

    async onModuleInit() {
        // Ajusta buffer size por ENV
        this.store.setLimit(parseInt(this.env.EVENTS_BUFFER, 10) || 300);
        this.subscribeMintWide();
    }

    // REST helpers
    snapshot() { return this.store.snapshot(); }
    stream() { return this.store.stream(); }
    size() { return this.store.size(); }

    private subscribeMintWide() {
        const sub = (pid: PublicKey, label: 'spl-token' | 'token-2022') => {
            this.conn.onLogs(pid, async (e) => {
                const sig = e.signature;
                if (!sig || this.seen.has(sig)) return;
                if (!e.logs?.some(l => /Instruction:\s*InitializeMint|InitializeMint2/i.test(l))) return;
                this.seen.add(sig);

                try {
                    const tx = await this.conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 } as any);
                    const meta: any = tx?.meta;
                    const msg: any = tx?.transaction?.message;
                    const keys = msg?.getAccountKeys ? msg.getAccountKeys().keySegments().flat() : msg?.accountKeys;
                    if (!meta?.innerInstructions || !keys) return;

                    const mints = new Set<string>();
                    for (const inner of meta.innerInstructions as any[]) {
                        for (const ix of inner.instructions) {
                            const pidIndex = ix.programIdIndex ?? ix.programId;
                            const prog = pidIndex instanceof PublicKey ? pidIndex : new PublicKey(keys[pidIndex]);
                            const isSPL = prog.equals(TOKEN_PROGRAM_ID) || prog.equals(TOKEN_2022_PROGRAM_ID);
                            if (!isSPL) continue;
                            const first = ix.accounts?.[0];
                            if (typeof first === 'number') mints.add(new PublicKey(keys[first]).toBase58());
                        }
                    }

                    for (const m of mints) {
                        const mint = new PublicKey(m);
                        const info = await this.mintInfo.safeGetMintInfo(mint);
                        if (!info) continue;

                        const [mintOwner, freezeOwner] = await Promise.all([
                            this.mintInfo.classifyAuthorityOwner(info.mintAuthority ?? null),
                            this.mintInfo.classifyAuthorityOwner(info.freezeAuthority ?? null),
                        ]);

                        const hasRoute = this.env.CHECK_JUP_ROUTE === 'true'
                            ? await this.routes.hasJupRoute(mint, parseInt(this.env.SLIPPAGE_BPS, 10) || 200)
                            : false;

                        const details = {
                            decimals: info.decimals,
                            mintAuthority: info.mintAuthority ? info.mintAuthority.toBase58() : null,
                            freezeAuthority: info.freezeAuthority ? info.freezeAuthority.toBase58() : null,
                            authorityOwner: { mint: mintOwner, freeze: freezeOwner },
                            hasRoute,
                            // activity1m lo expone LaunchpadsService vía controller (si lo quieres aquí, inyecta el servicio)
                        };

                        const event = { source: label, mint: m, ts: Date.now(), details };
                        event['stage'] = this.stage.compute(event); // opcional: guardar stage

                        this.store.push(event);
                        this.log.log(`🆕 [${label}] ${m} dec:${details.decimals} route:${hasRoute ? '✅' : '—'}`);
                    }
                } catch { }
            }, 'confirmed');
        };

        sub(TOKEN_PROGRAM_ID, 'spl-token');
        sub(TOKEN_2022_PROGRAM_ID, 'token-2022');
        this.log.log('Mint-wide suscrito a SPL-Token y Token-2022');
    }
}
