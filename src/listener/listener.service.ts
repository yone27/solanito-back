import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { z } from 'zod';
import { Subject, Observable } from 'rxjs';

export type MintEvent = {
    source: 'spl-token' | 'token-2022' | 'pumpfun';
    mint: string;
    ts: number;
    details?: {
        decimals?: number;
        mintAuthority?: string | null;
        freezeAuthority?: string | null;
        authorityOwner?: {
            mint: AuthorityOwnerInfo;
            freeze: AuthorityOwnerInfo;
        };
    };
};

type AuthorityOwnerInfo = {
    label: 'none' | 'no-account' | 'system' | 'spl-token' | 'token-2022' | 'pumpfun' | 'other';
    programId?: string | null;
};

const EnvSchema = z.object({
    RPC_HTTP_URL: z.string().url(),
    RPC_WS_URL: z.string().url(),
    SHOW_MINT_INFO: z.string().default('true'),
    EVENTS_BUFFER: z.string().default('300'),
    PUMPFUN_PROGRAM_ID: z.string().optional(),
});

@Injectable()
export class ListenerService implements OnModuleInit {
    private readonly log = new Logger(ListenerService.name);
    private readonly seenSigs = new Set<string>();

    // >>> Añadimos stream + buffer
    private readonly events$ = new Subject<MintEvent>();
    private buffer: MintEvent[] = [];
    private bufferLimit: number;

    private conn!: Connection;
    private pumpfunPid?: PublicKey;
    private readonly showInfo: boolean;

    private async classifyAuthorityOwner(pk: PublicKey | null): Promise<AuthorityOwnerInfo> {
        if (!pk) return { label: 'none' };

        // Puede no existir cuenta (wallet/PDA “virtual”)
        const acc = await this.conn.getAccountInfo(pk);
        if (!acc) return { label: 'no-account', programId: null };

        const owner = acc.owner;
        if (this.pumpfunPid && owner.equals(this.pumpfunPid)) {
            return { label: 'pumpfun', programId: owner.toBase58() };
        }
        if (owner.equals(SystemProgram.programId)) {
            return { label: 'system', programId: owner.toBase58() };
        }
        if (owner.equals(TOKEN_PROGRAM_ID)) {
            return { label: 'spl-token', programId: owner.toBase58() };
        }
        if (owner.equals(TOKEN_2022_PROGRAM_ID)) {
            return { label: 'token-2022', programId: owner.toBase58() };
        }
        return { label: 'other', programId: owner.toBase58() };
    }

    constructor(private readonly config: ConfigService) {
        const parsed = EnvSchema.parse({
            RPC_HTTP_URL: config.get<string>('RPC_HTTP_URL'),
            RPC_WS_URL: config.get<string>('RPC_WS_URL'),
            SHOW_MINT_INFO: config.get<string>('SHOW_MINT_INFO') ?? 'true',
            EVENTS_BUFFER: config.get<string>('EVENTS_BUFFER') ?? '300',
            PUMPFUN_PROGRAM_ID: config.get<string>('PUMPFUN_PROGRAM_ID') ?? undefined,
        });

        this.conn = new Connection(parsed.RPC_HTTP_URL, {
            commitment: 'confirmed',
            wsEndpoint: parsed.RPC_WS_URL,
        });

        this.showInfo = parsed.SHOW_MINT_INFO === 'true';
        this.bufferLimit = Math.max(50, parseInt(parsed.EVENTS_BUFFER, 10) || 300);

        this.pumpfunPid = parsed.PUMPFUN_PROGRAM_ID
            ? new PublicKey(parsed.PUMPFUN_PROGRAM_ID)
            : undefined;
    }

    async onModuleInit() {
        this.log.log('Inicializando Listener…');
        this.subscribeMintWide();
    }

    // ============== MÉTODOS QUE TE FALTAN ==============
    /** Últimos eventos (ordenados del más reciente al más viejo). */
    getRecent(limit = 50): MintEvent[] {
        const n = Math.max(1, Math.min(limit, this.bufferLimit));
        return this.buffer.slice(-n).reverse();
    }

    /** Total de eventos acumulados en el buffer. */
    getTotal(): number {
        return this.buffer.length;
    }

    /** Stream en tiempo real para SSE/WebSocket. */
    stream(): Observable<MintEvent> {
        return this.events$.asObservable();
    }
    // ===================================================

    // ------------ Mint-wide (SPL Token + Token-2022) ------------
    private subscribeMintWide() {
        const subscribe = (programId: PublicKey, label: 'spl-token' | 'token-2022') => {
            this.conn.onLogs(
                programId,
                async (e) => {
                    const sig = e.signature;
                    if (!sig || this.seenSigs.has(sig)) return;
                    if (!this.maybeIsInitializeMintLog(e.logs)) return;
                    this.seenSigs.add(sig);

                    try {
                        const tx = await this.conn.getTransaction(sig, {
                            maxSupportedTransactionVersion: 0,
                        } as any);
                        if (!tx) return;

                        const meta: any = tx.meta;
                        const message: any = tx.transaction.message;
                        const keys = message.getAccountKeys
                            ? message.getAccountKeys().keySegments().flat()
                            : message.accountKeys;

                        const mints = new Set<string>();

                        if (meta?.innerInstructions) {
                            for (const inner of meta.innerInstructions as any[]) {
                                for (const ix of inner.instructions) {
                                    const pidIndex = ix.programIdIndex ?? ix.programId;
                                    const pid =
                                        pidIndex instanceof PublicKey
                                            ? pidIndex
                                            : new PublicKey(keys[pidIndex]);
                                    const isTokenProg =
                                        pid.equals(TOKEN_PROGRAM_ID) || pid.equals(TOKEN_2022_PROGRAM_ID);
                                    if (!isTokenProg) continue;

                                    const firstAcc = ix.accounts?.[0];
                                    if (typeof firstAcc === 'number') {
                                        const mintPk = new PublicKey(keys[firstAcc]);
                                        mints.add(mintPk.toBase58());
                                    }
                                }
                            }
                        }

                        for (const m of mints) {
                            const mintPk = new PublicKey(m);
                            let details: MintEvent['details'] | undefined = undefined;
                            if (this.showInfo) {
                                const info = await this.safeGetMintInfo(mintPk);
                                if (info) {
                                    const mintAuth = info.mintAuthority ?? null;
                                    const freezeAuth = info.freezeAuthority ?? null;

                                    const [mintAuthOwner, freezeAuthOwner] = await Promise.all([
                                        this.classifyAuthorityOwner(mintAuth),
                                        this.classifyAuthorityOwner(freezeAuth),
                                    ]);

                                    details = {
                                        decimals: info.decimals,
                                        mintAuthority: info.mintAuthority?.toBase58() ?? null,
                                        freezeAuthority: info.freezeAuthority?.toBase58() ?? null,
                                        // 👇 NUEVO
                                        authorityOwner: {
                                            mint: mintAuthOwner,     // { label, programId }
                                            freeze: freezeAuthOwner, // { label, programId }
                                        },
                                    };
                                }
                            }

                            this.push({
                                source: label,
                                mint: m,
                                ts: Date.now(),
                                details,
                            });
                        }
                    } catch {
                        // silencioso
                    }
                },
                'confirmed',
            );
        };

        subscribe(TOKEN_PROGRAM_ID, 'spl-token');
        subscribe(TOKEN_2022_PROGRAM_ID, 'token-2022');
        this.log.log('Mint-wide: escuchando InitializeMint en SPL Token y Token-2022…');
    }

    private push(event: MintEvent) {
        this.buffer.push(event);
        if (this.buffer.length > this.bufferLimit) this.buffer.shift();
        this.events$.next(event);
        this.log.log(
            `🆕 [${event.source}] ${event.mint}` +
            (event.details
                ? ` dec:${event.details.decimals ?? '?'} freeze:${event.details?.freezeAuthority ? 'yes' : 'no'} mintAuth:${event.details?.mintAuthority ? 'yes' : 'no'}`
                : ''),
        );
    }

    private maybeIsInitializeMintLog(logs: string[]): boolean {
        return logs.some(
            (l) => /Instruction:\s*InitializeMint/i.test(l) || /InitializeMint2/i.test(l),
        );
    }

    private async safeGetMintInfo(mint: PublicKey) {
        try {
            return await getMint(this.conn, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
        } catch { }
        try {
            return await getMint(this.conn, mint, 'confirmed', TOKEN_PROGRAM_ID);
        } catch { }
        return null;
    }
}
